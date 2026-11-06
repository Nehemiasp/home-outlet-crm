import { db } from "@/lib/db";
import { CANALES } from "@/lib/canales/tipos";
import type { ModoAsistente } from "@/generated/prisma/client";

export type AjustesIa = {
  encendido: boolean;
  canales: string[];
  modo: ModoAsistente;
  bienvenida: string;
  limiteRespuestas: number;
  presupuestoMensualUsd: number | null;
};

export async function obtenerAjustesIa(): Promise<AjustesIa> {
  const a = await db.aiSettings.upsert({ where: { id: "ia" }, create: {}, update: {} });
  return { encendido: a.encendido, canales: a.canales, modo: a.modo, bienvenida: a.bienvenida, limiteRespuestas: a.limiteRespuestas, presupuestoMensualUsd: a.presupuestoMensualUsd };
}

export async function guardarAjustesIa(d: AjustesIa): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!d.bienvenida.trim()) return { ok: false, error: "Escriba el mensaje de bienvenida." };
  if (d.bienvenida.length > 600) return { ok: false, error: "El mensaje de bienvenida pasa de 600 caracteres." };
  if (!Number.isInteger(d.limiteRespuestas) || d.limiteRespuestas < 1 || d.limiteRespuestas > 30) return { ok: false, error: "El límite de respuestas debe ser un número entre 1 y 30." };
  if (d.presupuestoMensualUsd !== null && (!Number.isFinite(d.presupuestoMensualUsd) || d.presupuestoMensualUsd <= 0 || d.presupuestoMensualUsd > 100_000)) return { ok: false, error: "El presupuesto debe ser un monto mayor que cero." };
  const canales = d.canales.filter((c): c is (typeof CANALES)[number] => (CANALES as readonly string[]).includes(c));
  const datos = { encendido: d.encendido, canales, modo: d.modo, bienvenida: d.bienvenida.trim(), limiteRespuestas: d.limiteRespuestas, presupuestoMensualUsd: d.presupuestoMensualUsd };
  await db.aiSettings.upsert({ where: { id: "ia" }, create: { id: "ia", ...datos }, update: datos });
  return { ok: true };
}

/* ── Presupuesto mensual ── */
const PRESUPUESTO_POR_DEFECTO = 10;

export async function estadoPresupuesto(ahora = new Date()) {
  const a = await obtenerAjustesIa();
  const presupuesto = a.presupuestoMensualUsd ?? (Number(process.env.AI_MONTHLY_BUDGET_USD) || PRESUPUESTO_POR_DEFECTO);
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const { _sum } = await db.aiRun.aggregate({ _sum: { costoUsd: true }, where: { creado: { gte: inicio } } });
  const gasto = _sum.costoUsd ?? 0;
  const porcentaje = (gasto / presupuesto) * 100;
  return { gasto, presupuesto, porcentaje, aviso: porcentaje >= 80, agotado: porcentaje >= 100 };
}
