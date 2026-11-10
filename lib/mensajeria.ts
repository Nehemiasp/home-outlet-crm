import { adaptador } from "@/lib/canales";
import type { Channel, InboundMessage, OutboundMessage } from "@/lib/canales/tipos";
import { textoVentanaCerrada } from "@/lib/canales/ventana";
import { db } from "@/lib/db";
import { alResponder } from "@/lib/equipo/compartida";
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

/** Cuántos mensajes de la plataforma ocupa un mensaje nuestro (la tarjeta de producto o un texto largo salen partidos). Lo dice el canal. */
const pesoDe = (canal: Channel, tipo: string, texto?: string | null) =>
  adaptador(canal)?.contarMensajes?.({ type: tipo === "product" ? "product" : tipo === "image" ? "image" : "text", text: texto ?? undefined }) ?? 1;

/**
 * Cuántos mensajes más se pueden mandar sin que el cliente vuelva a escribir, o null si el canal no tiene tope (TikTok: 10 seguidos).
 * Cuenta lo que ya salió desde el último mensaje del cliente; lo que falló no cuenta.
 */
export async function salientesRestantes(conv: { id: string; canal: Channel; lastInboundAt: Date | null }): Promise<number | null> {
  const tope = adaptador(conv.canal)?.maxSalientes;
  if (!tope) return null;
  const filas = await db.message.findMany({
    where: { conversacionId: conv.id, direccion: "saliente", estado: { not: "fallo" }, ...(conv.lastInboundAt ? { fecha: { gt: conv.lastInboundAt } } : {}) },
    select: { tipo: true, texto: true },
  });
  return Math.max(0, tope - filas.reduce((n, m) => n + pesoDe(conv.canal, m.tipo, m.texto), 0));
}

/** El motivo por el que un mensaje no cabe en el tope del canal, o null si cabe. */
async function topeSuperado(conv: { id: string; canal: Channel; lastInboundAt: Date | null }, peso: number): Promise<string | null> {
  const quedan = await salientesRestantes(conv);
  if (quedan === null || quedan >= peso) return null;
  return `Este canal solo permite ${adaptador(conv.canal)!.maxSalientes} mensajes seguidos sin que el cliente responda. Podrá escribir cuando el cliente vuelva a escribir.`;
}

export type ResultadoEnvio = { ok: true; mensajeId: string } | { ok: false; error: string; mensajeId?: string };

/**
 * Manda un producto: la tarjeta (nombre y precio) con la primera foto elegida y, detrás, las demás fotos elegidas, sin texto.
 * Solo se aceptan fotos del propio producto, y salen en el orden del catálogo. `fotos` sin indicar = solo la principal (como antes);
 * "todas" = todas las del producto (el asistente, cuando el cliente pide más fotos). Un producto sin fotos manda la tarjeta sola.
 * `mensajeId` es el de la tarjeta; `mensajesIds`, todos los que salieron.
 */
export async function enviarProductoConFotos(p: {
  conversacionId: string; productoId: string; fotos?: string[] | "todas"; usuarioId?: string; autor?: "asesor" | "asistente"; aiRunId?: string;
}): Promise<ResultadoEnvio & { mensajesIds?: string[] }> {
  const producto = await db.product.findFirst({ where: { id: p.productoId, activo: true }, select: { id: true, imagenes: true } });
  if (!producto) return { ok: false, error: "El producto ya no está disponible." };
  const elegidas = p.fotos === "todas" ? producto.imagenes : p.fotos?.length ? producto.imagenes.filter((f) => p.fotos!.includes(f)) : producto.imagenes.slice(0, 1);
  if (Array.isArray(p.fotos) && p.fotos.length && elegidas.length === 0) return { ok: false, error: "Esas fotos ya no son de este producto. Vuelva a elegirlas." };

  const base = { conversacionId: p.conversacionId, usuarioId: p.usuarioId, autor: p.autor, aiRunId: p.aiRunId };
  const tarjeta = await enviarMensaje({ ...base, mensaje: { type: "product", productId: producto.id, mediaUrl: elegidas[0] } });
  if (!tarjeta.ok) return tarjeta;
  const mensajesIds = [tarjeta.mensajeId];
  for (const [i, foto] of elegidas.slice(1).entries()) {
    const r = await enviarMensaje({ ...base, mensaje: { type: "image", mediaUrl: foto } });
    if (!r.ok) return { ok: false, error: `Se envió la tarjeta${i ? ` y ${i} foto${i === 1 ? "" : "s"} más` : ""}, pero no el resto de las fotos: ${r.error}`, mensajeId: r.mensajeId ?? tarjeta.mensajeId, mensajesIds };
    mensajesIds.push(r.mensajeId);
  }
  return { ok: true, mensajeId: tarjeta.mensajeId, mensajesIds };
}

/** Envía un mensaje al cliente por el canal de la conversación. Si el canal falla, el mensaje queda en "fallo" para reintentar. */
export async function enviarMensaje(p: { conversacionId: string; usuarioId?: string; autor?: "asesor" | "asistente"; aiRunId?: string; pedidoId?: string; aviso?: boolean; mensaje: OutboundMessage }): Promise<ResultadoEnvio> {
  const autor = p.autor ?? (p.usuarioId ? "asesor" : "asistente");
  const conv = await db.conversation.findUnique({ where: { id: p.conversacionId }, include: { contacto: { include: { identidades: true } } } });
  if (!conv) return { ok: false, error: "La conversación no existe." };

  const canal = adaptador(conv.canal);
  if (!canal) return { ok: false, error: "Este canal todavía no está conectado." };
  // Una plantilla es justamente lo que sí se puede enviar con la ventana cerrada.
  if (p.mensaje.type !== "template" && !canal.canSendFreeForm(conv)) return { ok: false, error: textoVentanaCerrada(conv.canal) };
  const identidad = conv.contacto.identidades.find((i) => i.canal === conv.canal);
  if (!identidad) return { ok: false, error: "El contacto no tiene datos para este canal." };
  const tope = await topeSuperado(conv, pesoDe(conv.canal, p.mensaje.type, p.mensaje.text));
  if (tope) return { ok: false, error: tope };

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
  // En la bandeja compartida, quien le escribe al cliente queda asignado o se suma (los avisos automáticos no cuentan).
  if (autor === "asesor" && !p.aviso && p.usuarioId) await alResponder(conv.id, p.usuarioId);

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
  if (!canal.canSendFreeForm(conv)) return { ok: false, error: textoVentanaCerrada(conv.canal), mensajeId };
  const identidad = conv.contacto.identidades.find((i) => i.canal === conv.canal);
  if (!identidad) return { ok: false, error: "El contacto no tiene datos para este canal.", mensajeId };
  const tope = await topeSuperado(conv, pesoDe(conv.canal, msg.tipo, msg.texto));
  if (tope) return { ok: false, error: tope, mensajeId };

  await db.message.update({ where: { id: msg.id }, data: { estado: "enviando" } });
  try {
    const tipo = msg.tipo === "product" ? "product" : msg.tipo === "image" ? "image" : msg.tipo === "document" ? "document" : "text";
    const { externalMessageId } = await canal.send(identidad.externalContactId, { type: tipo, text: msg.texto ?? undefined, mediaUrl: msg.archivoUrl ?? undefined, productId: msg.productoId ?? undefined });
    await db.message.update({ where: { id: msg.id }, data: { externalMessageId, estado: "enviado" } });
    return { ok: true, mensajeId: msg.id };
  } catch {
    await db.message.update({ where: { id: msg.id }, data: { estado: "fallo" } });
    return { ok: false, error: "No se envió.", mensajeId: msg.id };
  }
}
