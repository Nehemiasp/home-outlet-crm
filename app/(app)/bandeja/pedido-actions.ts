"use server";

import { z } from "zod";
import * as pedidos from "@/lib/pedidos/pedidos";
import type { DatosPanelPedido, EntradaPedido, ProductoPedido, ResultadoPedido, VistaPedido } from "@/lib/pedidos/tipos";
import { requireUsuario } from "@/lib/session";
import { puedeVerConversacion, puedeVerPedido } from "@/lib/visibilidad";
import type { Rol } from "@/lib/permisos";

const id = z.string().min(1).max(40);
const entrada = z.object({
  pedidoId: id.nullable(),
  conversacionId: id,
  cliente: z.object({ nombre: z.string().max(200), telefono: z.string().max(40), municipio: z.string().max(100) }),
  lineas: z.array(z.object({ productoId: id, cantidad: z.number(), ubicacionId: id.nullable() })).max(100),
  entrega: z.enum(["recoger", "envio"]),
  direccion: z.string().max(600),
  referencia: z.string().max(600),
  descuento: z.object({ tipo: z.enum(["monto", "porcentaje"]), valor: z.string().max(20) }).nullable(),
  descuentoMotivo: z.string().max(400),
  notas: z.string().max(1000),
  metodoPago: z.enum(["transferencia", "deposito", "efectivo_en_tienda", "tarjeta"]).nullish(),
});

async function actor() {
  const u = await requireUsuario();
  return { id: u.id, nombre: u.nombre, rol: u.rol };
}
const invalido = { ok: false, error: "Revise los datos del pedido." } as const;
const noExiste = { ok: false, error: "La conversación no existe." } as const;
/** La conversación (y el borrador, si lo hay) tienen que ser de quien los pide. */
async function ve(u: { id: string; rol: Rol }, conversacionId: string, pedidoId?: string | null) {
  return (await puedeVerConversacion(u, conversacionId)) && (!pedidoId || (await puedeVerPedido(u, pedidoId)));
}

export async function abrirPanelPedido(conversacionId: string): Promise<ResultadoPedido<{ datos: DatosPanelPedido }>> {
  const a = await actor();
  if (!(await ve(a, id.parse(conversacionId)))) return noExiste;
  return pedidos.datosPanel(id.parse(conversacionId), a);
}

export async function buscarProductosPedido(q: string): Promise<ProductoPedido[]> {
  await requireUsuario();
  return pedidos.buscarParaPedido(z.string().trim().max(60).parse(q));
}

export async function previsualizarPedido(e: EntradaPedido): Promise<ResultadoPedido<{ vista: VistaPedido }>> {
  const a = await actor();
  const p = entrada.safeParse(e);
  if (!p.success) return invalido;
  if (!(await ve(a, p.data.conversacionId, p.data.pedidoId))) return noExiste;
  return pedidos.previsualizar(p.data, a);
}

export async function guardarBorradorPedido(e: EntradaPedido): Promise<ResultadoPedido<{ pedidoId: string; codigo: string }>> {
  const a = await actor();
  const p = entrada.safeParse(e);
  if (!p.success) return invalido;
  if (!(await ve(a, p.data.conversacionId, p.data.pedidoId))) return noExiste;
  return pedidos.guardarBorrador(p.data, a);
}

export async function cargarBorradorPedido(pedidoId: string, conversacionId: string) {
  const u = await requireUsuario();
  if (!(await ve(u, id.parse(conversacionId), id.parse(pedidoId)))) return { ok: false as const, error: "El pedido no existe en esta conversación." };
  return pedidos.cargarBorrador(id.parse(pedidoId), id.parse(conversacionId));
}

export async function descartarBorradorPedido(pedidoId: string): Promise<ResultadoPedido> {
  const a = await actor();
  if (!(await puedeVerPedido(a, id.parse(pedidoId)))) return { ok: false, error: "El pedido no existe." };
  return pedidos.descartarBorrador(id.parse(pedidoId), a);
}

/** Guarda y envía en un solo paso: el cliente nunca recibe un resumen de algo que no quedó guardado. */
export async function enviarPedido(e: EntradaPedido, modo: "enviar" | "copiado", sobrePedido: boolean): Promise<ResultadoPedido<{ texto: string; codigo: string; pedidoId: string }>> {
  const a = await actor();
  const p = entrada.safeParse(e);
  if (!p.success) return invalido;
  if (!(await ve(a, p.data.conversacionId, p.data.pedidoId))) return noExiste;
  const g = await pedidos.guardarBorrador(p.data, a);
  if (!g.ok) return g;
  const r = await pedidos.enviarAlCliente(g.pedidoId, a, { modo: z.enum(["enviar", "copiado"]).parse(modo), sobrePedido });
  return r.ok ? { ok: true, texto: r.texto, codigo: g.codigo, pedidoId: g.pedidoId } : r;
}
