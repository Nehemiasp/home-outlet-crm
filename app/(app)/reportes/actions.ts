"use server";

import { z } from "zod";
import { CANALES } from "@/lib/canales/tipos";
import { puedeVerReporteAsesores, puedeVerReportes } from "@/lib/permisos";
import { generarReportes, validarFiltros, type Reportes } from "@/lib/reportes";
import { requireUsuario } from "@/lib/session";

const filtros = z.object({ desde: z.string().max(10), hasta: z.string().max(10), canal: z.enum(["todos", ...CANALES]) });

export async function obtenerReportes(f: z.input<typeof filtros>): Promise<{ ok: true; datos: Reportes } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (!puedeVerReportes(u)) return { ok: false, error: "Solo un administrador o un jefe de tienda puede ver los reportes." };
  const p = filtros.safeParse(f);
  if (!p.success) return { ok: false, error: "Revise los filtros." };
  const error = validarFiltros(p.data);
  if (error) return { ok: false, error };
  return { ok: true, datos: await generarReportes(p.data, { asesores: puedeVerReporteAsesores(u) }) };
}
