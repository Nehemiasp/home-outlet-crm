import { db } from "@/lib/db";
import type { ModoAsignacion } from "@/generated/prisma/client";

export type AjustesEquipo = { modoAsignacion: ModoAsignacion; asesoresVenSoloSuyas: boolean };

// Se lee en cada consulta de la bandeja, contactos y pedidos: una copia de unos segundos evita una consulta más por petición.
let copia: { datos: AjustesEquipo; hasta: number } | null = null;
const VIGENCIA_MS = 3_000;

export async function obtenerAjustesEquipo(): Promise<AjustesEquipo> {
  if (copia && copia.hasta > Date.now()) return copia.datos;
  // Un upsert simultáneo (varias peticiones a la vez) puede chocar al crear la fila: se lee primero y se ignora el choque.
  const f = (await db.ajustesEquipo.findUnique({ where: { id: "equipo" } })) ?? (await db.ajustesEquipo.create({ data: { id: "equipo" } }).catch(() => db.ajustesEquipo.findUniqueOrThrow({ where: { id: "equipo" } })));
  const datos = { modoAsignacion: f.modoAsignacion, asesoresVenSoloSuyas: f.asesoresVenSoloSuyas };
  copia = { datos, hasta: Date.now() + VIGENCIA_MS };
  return datos;
}

export async function guardarAjustesEquipo(d: Partial<AjustesEquipo>, actor: { id: string; nombre: string }) {
  const f = await db.ajustesEquipo.upsert({ where: { id: "equipo" }, update: d, create: { id: "equipo", ...d } });
  copia = null;
  await db.activityLog.create({ data: { usuarioId: actor.id, accion: "ajustes_equipo", entidad: "AjustesEquipo", entidadId: "equipo", detalle: { ...d, por: actor.nombre } } });
  return { modoAsignacion: f.modoAsignacion, asesoresVenSoloSuyas: f.asesoresVenSoloSuyas };
}

/** Para las pruebas: olvida la copia. */
export const olvidarAjustesEquipo = () => {
  copia = null;
};
