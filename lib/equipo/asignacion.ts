import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { obtenerAjustesEquipo } from "./ajustes";

/** Cuántas conversaciones tiene abiertas un asesor y cuándo recibió la última. */
export type Candidato = { id: string; nombre: string; abiertas: number; ultimaAsignacionEn: Date | null };
export type Regla = "responsable" | "menos_carga";

/**
 * La regla de reparto, sin base de datos (así se prueba sola). Recibe solo asesores Disponibles.
 *  a. el asesor responsable del contacto, si está entre los disponibles;
 *  b. si no, el que tiene menos conversaciones abiertas; en empate, el que lleva más tiempo sin recibir una;
 *  c. quien devolvió la conversación a la cola queda excluido.
 * Devuelve null si no hay nadie.
 */
export function elegirAsesor(candidatos: Candidato[], o: { responsableId?: string | null; excluirId?: string | null } = {}): { asesor: Candidato; regla: Regla } | null {
  const validos = candidatos.filter((c) => c.id !== o.excluirId);
  if (validos.length === 0) return null;
  const responsable = o.responsableId ? validos.find((c) => c.id === o.responsableId) : undefined;
  if (responsable) return { asesor: responsable, regla: "responsable" };
  const ordenados = [...validos].sort(
    (a, b) =>
      a.abiertas - b.abiertas ||
      (a.ultimaAsignacionEn?.getTime() ?? 0) - (b.ultimaAsignacionEn?.getTime() ?? 0) || // quien nunca recibió, primero
      a.nombre.localeCompare(b.nombre, "es") ||
      a.id.localeCompare(b.id),
  );
  return { asesor: ordenados[0]!, regla: "menos_carga" };
}

export type Asignada = { conversacionId: string; asesorId: string; nombre: string; regla: Regla };
type Motivo = "sin_candidato" | "no_aplica";
export type ResultadoAsignacion = { ok: true; asignada: Asignada } | { ok: false; motivo: Motivo };

// Todas las decisiones de reparto pasan una a una por este bloqueo: así dos mensajes simultáneos
// no asignan la misma conversación dos veces ni cuentan la carga con datos viejos.
const BLOQUEO_REPARTO = 7_150_001;

/** Una conversación espera un asesor si está abierta, nadie la tiene asignada y no la atiende el asistente. */
export const esperaAsesor: Prisma.ConversationWhereInput = { estado: { not: "cerrada" }, asignadaAId: null, atendidaPor: { not: "asistente" } };

/** Asesores (rol agente) disponibles ahora, con su carga. Dentro de una transacción para que sea consistente con el bloqueo. */
export async function candidatosDisponibles(tx: Prisma.TransactionClient): Promise<Candidato[]> {
  const asesores = await tx.user.findMany({ where: { rol: "agente", activo: true, estadoAsesor: "disponible" }, select: { id: true, nombre: true, ultimaAsignacionEn: true } });
  if (asesores.length === 0) return [];
  const cargas = await tx.conversation.groupBy({ by: ["asignadaAId"], where: { estado: { not: "cerrada" }, asignadaAId: { in: asesores.map((a) => a.id) } }, _count: { _all: true } });
  const porId = new Map(cargas.map((c) => [c.asignadaAId, c._count._all]));
  return asesores.map((a) => ({ ...a, abiertas: porId.get(a.id) ?? 0 }));
}

/** Texto y datos que quedan en la conversación como mensaje de sistema. */
export type TipoAsignacion = "automatica" | "cola" | "reparto";

/**
 * Asigna una conversación según las reglas del equipo. Con modo Manual no hace nada.
 * Es una transacción con bloqueo: si ya tiene asesor, está cerrada o la atiende el asistente, no la toca.
 * `excluirId` evita devolverla a quien acaba de devolverla a la cola.
 */
export async function asignarConversacion(conversacionId: string, o: { excluirId?: string | null; tipo?: TipoAsignacion; ahora?: Date; /** En un reparto: quién perdió la conversación y quién lo hizo. */ de?: string; por?: string } = {}): Promise<ResultadoAsignacion> {
  if ((await obtenerAjustesEquipo()).modoAsignacion === "manual") return { ok: false, motivo: "no_aplica" };
  const ahora = o.ahora ?? new Date();

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BLOQUEO_REPARTO})`;
    const conv = await tx.conversation.findUnique({ where: { id: conversacionId }, select: { id: true, estado: true, asignadaAId: true, atendidaPor: true, excluirAsesorId: true, contacto: { select: { asesorResponsableId: true } } } });
    if (!conv || conv.asignadaAId || conv.estado === "cerrada" || conv.atendidaPor === "asistente") return { ok: false, motivo: "no_aplica" } as const;

    const elegido = elegirAsesor(await candidatosDisponibles(tx), { responsableId: conv.contacto.asesorResponsableId, excluirId: o.excluirId ?? conv.excluirAsesorId });
    if (!elegido) return { ok: false, motivo: "sin_candidato" } as const;

    // Solo gana quien la encuentra sin asesor: si otra persona la asignó a mano un instante antes, se respeta.
    const r = await tx.conversation.updateMany({
      where: { id: conv.id, asignadaAId: null },
      data: { asignadaAId: elegido.asesor.id, atendidaPor: "asesor", esperandoAsesorDesde: null, excluirAsesorId: null },
    });
    if (r.count === 0) return { ok: false, motivo: "no_aplica" } as const;
    await tx.user.update({ where: { id: elegido.asesor.id }, data: { ultimaAsignacionEn: ahora } });
    await tx.activityLog.create({
      data: { accion: "asignar", entidad: "Conversation", entidadId: conv.id, detalle: { tipo: o.tipo ?? "automatica", a: elegido.asesor.nombre, regla: elegido.regla, por: o.por ?? "el sistema", ...(o.de ? { de: o.de } : {}) } },
    });
    return { ok: true, asignada: { conversacionId: conv.id, asesorId: elegido.asesor.id, nombre: elegido.asesor.nombre, regla: elegido.regla } } as const;
  });
}

/**
 * Reparte las conversaciones que esperaban asesor, de la más antigua a la más nueva, entre quienes estén Disponibles.
 * Se llama cuando un asesor pasa a Disponible. Se detiene en cuanto no queda nadie disponible.
 * Devuelve cuántas asignó.
 */
export async function procesarCola(o: { ahora?: Date } = {}): Promise<number> {
  if ((await obtenerAjustesEquipo()).modoAsignacion === "manual") return 0;
  const pendientes = await db.conversation.findMany({
    where: { ...esperaAsesor, esperandoAsesorDesde: { not: null } },
    orderBy: [{ esperandoAsesorDesde: "asc" }, { lastMessageAt: "asc" }],
    select: { id: true },
  });
  let n = 0;
  for (const p of pendientes) {
    const r = await asignarConversacion(p.id, { tipo: "cola", ahora: o.ahora });
    if (r.ok) n++;
    else if (r.motivo === "sin_candidato") {
      // Esta conversación puede estar excluyendo justo al único disponible (la devolvió él): se sigue con las demás.
      if ((await hayDisponibles()) === 0) break;
    }
  }
  return n;
}

async function hayDisponibles() {
  return db.user.count({ where: { rol: "agente", activo: true, estadoAsesor: "disponible" } });
}

/** Cuántas conversaciones esperan asesor (para el aviso del administrador). */
export const contarSinAsignar = () => db.conversation.count({ where: { ...esperaAsesor, esperandoAsesorDesde: { not: null } } });
