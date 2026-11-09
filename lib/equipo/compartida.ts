import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { obtenerAjustesEquipo } from "./ajustes";

/**
 * Bandeja compartida (modo «compartida» de Ajustes → Equipo, el de fábrica). La pidió Home Outlet porque, con el reparto,
 * un asesor que se ocupaba en otra cosa y olvidaba pausar se quedaba con chats que nadie más veía.
 *
 * - Todos ven todas las conversaciones (`restringido` no aplica) y no se reparte nada: lo nuevo espera en «Sin asignar».
 * - Quien le escribe al cliente (un mensaje que le llega: texto, foto, producto, pedido, cotización o plantilla) queda asignado.
 *   La primera persona es la principal (`asignadaAId`); las siguientes se suman (`ParticipanteConversacion`).
 * - Las notas internas y los avisos automáticos no asignan a nadie.
 */
export const esCompartida = async () => (await obtenerAjustesEquipo()).modoAsignacion === "compartida";

/** Las conversaciones de una persona: las que tiene como principal o en las que participa (en la bandeja compartida son lo mismo). */
export const deAsesor = (usuarioId: string): Prisma.ConversationWhereInput => ({ OR: [{ asignadaAId: usuarioId }, { participantes: { some: { usuarioId } } }] });

/**
 * Lo llama `enviarMensaje` cuando una persona le escribe al cliente. Fuera de la bandeja compartida no hace nada.
 * La primera vez que alguien escribe en una conversación se suma; si no había nadie asignado, queda como principal.
 * Deja la línea «Asignada a Ana al responder» o «Carlos se sumó a la conversación».
 */
export async function alResponder(conversacionId: string, usuarioId: string): Promise<void> {
  if (!(await esCompartida())) return;
  await db.$transaction(async (tx) => {
    const nuevo = await tx.participanteConversacion.createMany({ data: [{ conversacionId, usuarioId }], skipDuplicates: true });
    if (nuevo.count === 0) return; // ya participaba
    // Solo queda como principal quien la encuentra sin asignar (si dos escriben a la vez, el segundo se suma).
    const principal = await tx.conversation.updateMany({ where: { id: conversacionId, asignadaAId: null }, data: { asignadaAId: usuarioId, esperandoAsesorDesde: null, excluirAsesorId: null } });
    const u = await tx.user.findUnique({ where: { id: usuarioId }, select: { nombre: true } });
    await tx.activityLog.create({ data: { usuarioId, accion: "asignar", entidad: "Conversation", entidadId: conversacionId, detalle: { tipo: principal.count ? "respuesta" : "se_suma", a: u?.nombre ?? null, por: u?.nombre ?? null } } });
  });
}

/**
 * «Devolver a la cola» en la bandeja compartida: la persona deja de participar. Si era la principal, pasa a serlo quien se
 * sumó primero; si no queda nadie, la conversación vuelve a «Sin asignar», a la vista de todos (no se reparte).
 */
export async function dejarConversacion(conversacionId: string, actor: { id: string; nombre: string }, motivo?: string): Promise<{ ok: true; asignadaA: string | null } | { ok: false; error: string }> {
  return db.$transaction(async (tx) => {
    const fuera = await tx.participanteConversacion.deleteMany({ where: { conversacionId, usuarioId: actor.id } });
    const conv = await tx.conversation.findUnique({ where: { id: conversacionId }, select: { asignadaAId: true, estado: true } });
    if (!conv || (fuera.count === 0 && conv.asignadaAId !== actor.id)) return { ok: false, error: "Usted no está asignado a esta conversación." } as const;
    let asignadaA: string | null = null;
    if (conv.asignadaAId === actor.id) {
      const siguiente = await tx.participanteConversacion.findFirst({ where: { conversacionId }, orderBy: { desde: "asc" }, select: { usuarioId: true, usuario: { select: { nombre: true } } } });
      await tx.conversation.update({
        where: { id: conversacionId },
        data: siguiente ? { asignadaAId: siguiente.usuarioId } : { asignadaAId: null, atendidaPor: "nadie", esperandoAsesorDesde: conv.estado === "cerrada" ? null : new Date() },
      });
      asignadaA = siguiente?.usuario.nombre ?? null;
    } else {
      asignadaA = (await tx.conversation.findUnique({ where: { id: conversacionId }, select: { asignadaA: { select: { nombre: true } } } }))?.asignadaA?.nombre ?? null;
    }
    await tx.activityLog.create({ data: { usuarioId: actor.id, accion: "asignar", entidad: "Conversation", entidadId: conversacionId, detalle: { tipo: "devolver", por: actor.nombre, ...(motivo ? { motivo } : {}) } } });
    return { ok: true, asignadaA } as const;
  });
}

/**
 * Asignar a mano (el administrador, o «Tomar conversación») en la bandeja compartida: la persona elegida pasa a ser la
 * principal y participa; quien era principal deja de participar (es un traspaso). Sin destino, nadie queda asignado.
 */
export async function participantesAlAsignar(tx: Prisma.TransactionClient, conversacionId: string, anteriorId: string | null, destinoId: string | null) {
  if (!destinoId) return tx.participanteConversacion.deleteMany({ where: { conversacionId } });
  if (anteriorId && anteriorId !== destinoId) await tx.participanteConversacion.deleteMany({ where: { conversacionId, usuarioId: anteriorId } });
  await tx.participanteConversacion.createMany({ data: [{ conversacionId, usuarioId: destinoId }], skipDuplicates: true });
}

/** Los nombres de quienes atienden, la principal primero (para «Asignada a Ana y Carlos»). */
export function nombresAsignados(c: { asignadaA: { id: string; nombre: string } | null; participantes: { desde: Date; usuario: { id: string; nombre: string } }[] }): { id: string; nombre: string }[] {
  const otros = [...c.participantes].sort((a, b) => a.desde.getTime() - b.desde.getTime()).map((p) => p.usuario).filter((u) => u.id !== c.asignadaA?.id);
  return c.asignadaA ? [c.asignadaA, ...otros] : otros;
}

