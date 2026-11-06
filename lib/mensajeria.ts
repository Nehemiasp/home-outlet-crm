import { adaptador } from "@/lib/canales";
import type { InboundMessage, OutboundMessage } from "@/lib/canales/tipos";
import { db } from "@/lib/db";
import { normalizarTelefono } from "@/lib/telefono";

const conTelefono = (canal: string) => canal === "whatsapp" || canal === "simulado";
const duplicado = (e: unknown) => (e as { code?: string })?.code === "P2002";

/**
 * Guarda un mensaje entrante. Idempotente: el mismo externalMessageId no se guarda dos veces.
 * Crea el contacto y la conversación si no existen; si la conversación estaba cerrada, la reabre.
 */
export async function recibirMensaje(m: InboundMessage): Promise<{ duplicado: boolean; conversacionId?: string }> {
  if (await db.message.findUnique({ where: { externalMessageId: m.externalMessageId }, select: { id: true } })) return { duplicado: true };

  try {
    return await db.$transaction(async (tx) => {
      const identidad = await tx.channelIdentity.findUnique({
        where: { canal_externalContactId: { canal: m.channel, externalContactId: m.externalContactId } },
      });
      let contactoId = identidad?.contactoId;

      if (!contactoId) {
        const telefono = conTelefono(m.channel) ? normalizarTelefono(m.externalContactId) : null;
        const existente = telefono ? await tx.contact.findUnique({ where: { telefono } }) : null;
        const contacto = existente ?? (await tx.contact.create({ data: { nombre: m.contactName?.trim() || telefono || "Cliente nuevo", telefono } }));
        contactoId = contacto.id;
        await tx.channelIdentity.create({
          data: { contactoId, canal: m.channel, externalContactId: m.externalContactId, alias: conTelefono(m.channel) ? null : (m.contactName ?? null) },
        });
      }

      const previa = await tx.conversation.findFirst({ where: { contactoId, canal: m.channel }, orderBy: { lastMessageAt: "desc" } });
      const datos = { lastMessageAt: m.timestamp, lastInboundAt: m.timestamp, noLeidos: { increment: 1 }, estado: previa?.estado === "cerrada" ? ("abierta" as const) : undefined };
      const conversacion = previa
        ? await tx.conversation.update({ where: { id: previa.id }, data: datos })
        : await tx.conversation.create({ data: { contactoId, canal: m.channel, lastMessageAt: m.timestamp, lastInboundAt: m.timestamp, noLeidos: 1 } });

      await tx.message.create({
        data: {
          conversacionId: conversacion.id,
          direccion: "entrante",
          tipo: m.type,
          texto: m.text,
          archivoUrl: m.mediaUrl,
          externalMessageId: m.externalMessageId,
          fecha: m.timestamp,
        },
      });
      return { duplicado: false, conversacionId: conversacion.id };
    });
  } catch (e) {
    if (duplicado(e)) return { duplicado: true }; // llegó dos veces al mismo tiempo
    throw e;
  }
}

export type ResultadoEnvio = { ok: true; mensajeId: string } | { ok: false; error: string; mensajeId?: string };

/** Envía un mensaje al cliente por el canal de la conversación. Si el canal falla, el mensaje queda en "fallo" para reintentar. */
export async function enviarMensaje(p: { conversacionId: string; usuarioId?: string; autor?: "asesor" | "asistente"; aiRunId?: string; pedidoId?: string; aviso?: boolean; mensaje: OutboundMessage }): Promise<ResultadoEnvio> {
  const autor = p.autor ?? (p.usuarioId ? "asesor" : "asistente");
  const conv = await db.conversation.findUnique({ where: { id: p.conversacionId }, include: { contacto: { include: { identidades: true } } } });
  if (!conv) return { ok: false, error: "La conversación no existe." };

  const canal = adaptador(conv.canal);
  if (!canal) return { ok: false, error: "Este canal todavía no está conectado." };
  // Una plantilla es justamente lo que sí se puede enviar con la ventana cerrada.
  if (p.mensaje.type !== "template" && !canal.canSendFreeForm(conv)) return { ok: false, error: "Pasaron más de 24 horas desde el último mensaje del cliente. Solo se pueden enviar plantillas aprobadas." };
  const identidad = conv.contacto.identidades.find((i) => i.canal === conv.canal);
  if (!identidad) return { ok: false, error: "El contacto no tiene datos para este canal." };

  const { type, text, mediaUrl, productId } = p.mensaje;
  const msg = await db.message.create({
    data: { conversacionId: conv.id, direccion: "saliente", tipo: type === "product" ? "product" : type === "template" ? "text" : type, texto: text, archivoUrl: mediaUrl, productoId: productId, estado: "enviando", enviadoPorId: p.usuarioId, autor, aiRunId: p.aiRunId, pedidoId: p.pedidoId },
  });
  // El primer asesor que le responde a un cliente queda como su asesor responsable.
  if (autor === "asesor" && !p.aviso && p.usuarioId && !conv.contacto.asesorResponsableId) {
    const asesor = await db.user.findFirst({ where: { id: p.usuarioId, rol: "agente" }, select: { id: true } });
    if (asesor) await db.contact.updateMany({ where: { id: conv.contactoId, asesorResponsableId: null }, data: { asesorResponsableId: asesor.id } });
  }
  // Cuando una persona escribe, el asistente deja de responder en esa conversación.
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: msg.fecha, ...(autor === "asesor" && !p.aviso ? { atendidaPor: "asesor", esperandoAsesorDesde: null } : {}) } });

  try {
    const { externalMessageId } = await canal.send(identidad.externalContactId, p.mensaje);
    await db.message.update({ where: { id: msg.id }, data: { externalMessageId, estado: "enviado" } });
    return { ok: true, mensajeId: msg.id };
  } catch {
    await db.message.update({ where: { id: msg.id }, data: { estado: "fallo" } });
    return { ok: false, error: "No se envió.", mensajeId: msg.id };
  }
}

/** Reintenta un mensaje saliente que quedó en "fallo". */
export async function reintentarMensaje(mensajeId: string): Promise<ResultadoEnvio> {
  const msg = await db.message.findUnique({ where: { id: mensajeId }, include: { conversacion: { include: { contacto: { include: { identidades: true } } } } } });
  if (!msg || msg.direccion !== "saliente" || msg.estado !== "fallo") return { ok: false, error: "Este mensaje no se puede reintentar." };

  const conv = msg.conversacion;
  const canal = adaptador(conv.canal);
  if (!canal) return { ok: false, error: "Este canal todavía no está conectado.", mensajeId };
  if (!canal.canSendFreeForm(conv)) return { ok: false, error: "Pasaron más de 24 horas desde el último mensaje del cliente. Solo se pueden enviar plantillas aprobadas.", mensajeId };
  const identidad = conv.contacto.identidades.find((i) => i.canal === conv.canal);
  if (!identidad) return { ok: false, error: "El contacto no tiene datos para este canal.", mensajeId };

  await db.message.update({ where: { id: msg.id }, data: { estado: "enviando" } });
  try {
    const tipo = msg.tipo === "product" ? "product" : msg.tipo === "image" ? "image" : "text";
    const { externalMessageId } = await canal.send(identidad.externalContactId, { type: tipo, text: msg.texto ?? undefined, mediaUrl: msg.archivoUrl ?? undefined, productId: msg.productoId ?? undefined });
    await db.message.update({ where: { id: msg.id }, data: { externalMessageId, estado: "enviado" } });
    return { ok: true, mensajeId: msg.id };
  } catch {
    await db.message.update({ where: { id: msg.id }, data: { estado: "fallo" } });
    return { ok: false, error: "No se envió.", mensajeId: msg.id };
  }
}
