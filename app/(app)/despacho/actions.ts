"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { avanzarDespacho, listarDespacho, type FilaDespacho } from "@/lib/pedidos/despacho";
import { envioDeFormulario } from "@/lib/pedidos/formulario-envio";
import type { ResultadoGuia } from "@/lib/pedidos/gestion";
import { puedeDespachar } from "@/lib/permisos";
import { requireConBodega } from "@/lib/session";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import { vencerReservas } from "@/lib/pedidos/vencimiento";

/** El despacho lo usa bodega (y el administrador y el jefe de tienda, que ya ven los pedidos completos). Cualquier otro rol, fuera. */
async function actor() {
  const u = await requireConBodega();
  if (!puedeDespachar(u)) redirect("/bandeja");
  return { id: u.id, nombre: u.nombre, rol: u.rol };
}

export async function listarParaDespacho(): Promise<FilaDespacho[]> {
  await actor();
  await vencerReservas();
  return listarDespacho();
}

const paso = z.enum(["preparando", "listo_para_recoger", "entregado"]);

/** Preparar, dejar listo para recoger o entregar. «Enviado» va por `enviarDesdeDespacho` (trae la guía). */
export async function darPaso(pedidoId: string, a: string): Promise<{ ok: true; aviso?: ResultadoAviso } | { ok: false; error: string }> {
  const u = await actor();
  const p = paso.safeParse(a);
  if (!p.success) return { ok: false, error: "Ese paso no lo da bodega." };
  return avanzarDespacho(z.string().min(1).max(40).parse(pedidoId), p.data, u);
}

/** «Marcar como enviado» desde Despacho: entrega propia, o paquetería con número de guía y la guía adjunta (foto o PDF). */
export async function enviarDesdeDespacho(datos: FormData): Promise<{ ok: true; aviso?: ResultadoAviso; guia?: ResultadoGuia } | { ok: false; error: string }> {
  const u = await actor();
  const p = envioDeFormulario(datos);
  if (!p) return { ok: false, error: "Revise los datos del envío." };
  return avanzarDespacho(p.pedidoId, "enviado", u, p.envio);
}
