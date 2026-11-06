"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { procesarEventoPasarela } from "@/lib/pagos-tarjeta/cobros";
import { pasarela } from "@/lib/pagos-tarjeta";
import { pasarelaSimulada } from "@/lib/pagos-tarjeta/simulada";

/**
 * «El proveedor» de la pasarela simulada: avisa del resultado igual que lo haría uno real (mismo camino: `procesarEventoPasarela`).
 * Solo existe con PASARELA=simulada y fuera de producción; con cualquier otra pasarela responde que no existe.
 */
export async function resolverCobroSimulado(externoId: string, resultado: "pagado" | "fallido"): Promise<{ ok: boolean; error?: string }> {
  if (pasarela() !== pasarelaSimulada) return { ok: false, error: "No existe." };
  const cobro = await db.cobroTarjeta.findUnique({ where: { externoId }, select: { monto: true, estado: true, pasarela: true } });
  if (!cobro || cobro.pasarela !== "simulada") return { ok: false, error: "No existe." };
  if (cobro.estado !== "creado") return { ok: false, error: "Este cobro ya se resolvió." };
  const r = await procesarEventoPasarela({ externoId, estado: resultado, monto: cobro.monto, referencia: `SIM-${externoId.slice(4, 12).toUpperCase()}` }, pasarelaSimulada);
  revalidatePath(`/pagar/${externoId}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
