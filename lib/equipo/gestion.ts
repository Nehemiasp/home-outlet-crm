import { db } from "@/lib/db";
import type { EstadoAsesor } from "@/generated/prisma/client";
import { asignarConversacion } from "./asignacion";
import { cambiarEstadoAsesor } from "./estado";
import { AUSENCIA_LARGA_MS, type FilaEquipo } from "./tipos";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * El asesor devuelve una conversación suya a la cola, con un motivo opcional. Deja de ser suya, queda esperando asesor
 * y se vuelve a repartir según las reglas de asignación, sin volver a caer en él.
 */
export async function devolverACola(conversacionId: string, actor: { id: string; nombre: string; rol: "admin" | "agente" }, motivo?: string): Promise<Resultado<{ asignadaA: string | null }>> {
  if (actor.rol !== "agente") return fallo("Solo un asesor puede devolver sus conversaciones a la cola.");
  const limpio = motivo?.trim().slice(0, 200) || undefined;
  const hecho = await db.$transaction(async (tx) => {
    // Solo la suelta quien la tiene asignada y mientras esté abierta; si otra persona la movió un instante antes, no pasa nada.
    const r = await tx.conversation.updateMany({
      where: { id: conversacionId, asignadaAId: actor.id, estado: { not: "cerrada" } },
      data: { asignadaAId: null, atendidaPor: "nadie", esperandoAsesorDesde: new Date(), excluirAsesorId: actor.id },
    });
    if (r.count === 0) return false;
    await tx.activityLog.create({ data: { usuarioId: actor.id, accion: "asignar", entidad: "Conversation", entidadId: conversacionId, detalle: { tipo: "devolver", por: actor.nombre, ...(limpio ? { motivo: limpio } : {}) } } });
    return true;
  });
  if (!hecho) return fallo("Esta conversación ya no está asignada a usted.");
  const r = await asignarConversacion(conversacionId, { excluirId: actor.id, tipo: "cola" });
  return { ok: true, asignadaA: r.ok ? r.asignada.nombre : null };
}

/** El estado de un asesor lo puede cambiar un administrador. Si la persona tiene la app abierta, el latido la vuelve a poner Disponible. */
export async function cambiarEstadoPorAdmin(asesorId: string, estado: EstadoAsesor, admin: { id: string }): Promise<Resultado> {
  const u = await db.user.findFirst({ where: { id: asesorId, rol: "agente", activo: true }, select: { id: true } });
  if (!u) return fallo("El asesor no existe o está desactivado.");
  await cambiarEstadoAsesor(u.id, { estado, motivo: estado === "en_pausa" ? "Pausado por un administrador" : null, origen: "admin", cambiadoPorId: admin.id });
  return { ok: true };
}

export async function panelEquipo(ahora = new Date()): Promise<FilaEquipo[]> {
  const asesores = await db.user.findMany({
    where: { rol: "agente", activo: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, estadoAsesor: true, estadoDesde: true, motivoPausa: true },
  });
  const cargas = await db.conversation.groupBy({ by: ["asignadaAId"], where: { estado: { not: "cerrada" }, asignadaAId: { in: asesores.map((a) => a.id) } }, _count: { _all: true } });
  const porId = new Map(cargas.map((c) => [c.asignadaAId, c._count._all]));
  return asesores.map((a) => {
    const abiertas = porId.get(a.id) ?? 0;
    return {
      id: a.id, nombre: a.nombre, estado: a.estadoAsesor, desde: a.estadoDesde.toISOString(), motivo: a.motivoPausa, abiertas,
      puedeRepartir: a.estadoAsesor !== "disponible" && abiertas > 0 && ahora.getTime() - a.estadoDesde.getTime() >= AUSENCIA_LARGA_MS,
    };
  });
}

/**
 * Reparte las conversaciones abiertas de un asesor que lleva más de 30 minutos en pausa o desconectado,
 * una por una según las reglas de asignación (sin volver a caer en él). Las que no encuentren a nadie disponible
 * quedan en «Sin asignar».
 */
export async function repartirConversaciones(asesorId: string, admin: { id: string; nombre: string }, ahora = new Date()): Promise<Resultado<{ repartidas: number; sinAsesor: number }>> {
  const fila = (await panelEquipo(ahora)).find((f) => f.id === asesorId);
  if (!fila) return fallo("El asesor no existe o está desactivado.");
  if (fila.estado === "disponible") return fallo(`${fila.nombre} está disponible: no hace falta repartir sus conversaciones.`);
  if (fila.abiertas === 0) return fallo(`${fila.nombre} no tiene conversaciones abiertas.`);
  if (!fila.puedeRepartir) return fallo(`${fila.nombre} lleva menos de 30 minutos ${fila.estado === "en_pausa" ? "en pausa" : "desconectado"}.`);

  const suyas = await db.conversation.findMany({ where: { asignadaAId: asesorId, estado: { not: "cerrada" } }, orderBy: { lastMessageAt: "asc" }, select: { id: true } });
  let repartidas = 0;
  let sinAsesor = 0;
  for (const c of suyas) {
    const liberada = await db.conversation.updateMany({
      where: { id: c.id, asignadaAId: asesorId },
      data: { asignadaAId: null, atendidaPor: "nadie", esperandoAsesorDesde: new Date(), excluirAsesorId: asesorId },
    });
    if (liberada.count === 0) continue; // ya se la quitaron
    const r = await asignarConversacion(c.id, { excluirId: asesorId, tipo: "reparto", de: fila.nombre, por: admin.nombre, ahora });
    if (r.ok) repartidas++;
    else {
      sinAsesor++;
      await db.activityLog.create({ data: { usuarioId: admin.id, accion: "asignar", entidad: "Conversation", entidadId: c.id, detalle: { tipo: "sin_asesor", por: admin.nombre, de: fila.nombre } } });
    }
  }
  return { ok: true, repartidas, sinAsesor };
}
