import { db } from "@/lib/db";
import { Prisma, type EstadoPedido } from "@/generated/prisma/client";
import { textoLugar } from "@/lib/guatemala";
import { esBodega, type ActorPedido } from "@/lib/permisos";
import { puedeVerPedido } from "@/lib/visibilidad";
import type { ResultadoAviso } from "./avisos";
import { siguientes } from "./estados";
import { avanzarPedido } from "./gestion";

/**
 * Despacho: lo que necesita quien empaca y entrega (el rol de bodega). Pedidos ya pagados, con los productos, las
 * cantidades y a dónde van; SIN precios, pagos, formas de pago ni conversaciones. Lo arma el servidor con un `select`
 * propio (no reutiliza el detalle del pedido), así ningún dato de dinero llega al navegador de bodega.
 */
export const ESTADOS_DESPACHO = ["pagado", "preparando", "listo_para_recoger", "enviado"] as const satisfies readonly EstadoPedido[];
/** Los pasos que bodega puede dar: preparar, dejarlo listo o enviarlo, y entregarlo. No cancela, no reactiva y no toca pagos. */
export const PASOS_BODEGA = ["preparando", "listo_para_recoger", "enviado", "entregado"] as const satisfies readonly EstadoPedido[];

export type FilaDespacho = {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  entrega: "recoger" | "envio";
  cliente: string;
  telefono: string | null;
  departamento: string | null;
  municipio: string | null;
  /** «Morales, Izabal» (vacío si es para recoger). */
  lugar: string;
  direccion: string | null;
  guia: string | null;
  notas: string | null;
  creada: string;
  lineas: { id: string; nombre: string; sku: string; cantidad: number; ubicacion: string | null; imagenUrl: string | null }[];
  /** Los pasos que bodega puede dar ahora a este pedido. */
  pasos: EstadoPedido[];
};

const SELECCION = {
  id: true, codigo: true, estado: true, entrega: true, departamento: true, municipio: true, direccion: true, guia: true, notas: true, creada: true,
  contacto: { select: { nombre: true, telefono: true } },
  lineas: { orderBy: [{ nombre: "asc" }, { id: "asc" }], select: { id: true, nombre: true, sku: true, cantidad: true, ubicacion: { select: { nombre: true } }, producto: { select: { imagenes: true } } } },
} satisfies Prisma.OrderSelect;

type Fila = Prisma.OrderGetPayload<{ select: typeof SELECCION }>;

const aFila = (o: Fila): FilaDespacho => ({
  id: o.id, codigo: o.codigo, estado: o.estado, entrega: o.entrega, cliente: o.contacto.nombre, telefono: o.contacto.telefono,
  departamento: o.departamento, municipio: o.municipio, lugar: o.entrega === "envio" ? textoLugar(o.municipio, o.departamento) : "",
  direccion: o.direccion, guia: o.guia, notas: o.notas, creada: o.creada.toISOString(),
  lineas: o.lineas.map((l) => ({ id: l.id, nombre: l.nombre, sku: l.sku, cantidad: l.cantidad, ubicacion: l.ubicacion?.nombre ?? null, imagenUrl: l.producto?.imagenes[0] ?? null })),
  pasos: siguientes(o.estado, o.entrega).filter((a) => (PASOS_BODEGA as readonly EstadoPedido[]).includes(a)),
});

/** Los pedidos por despachar, del más antiguo al más nuevo (el primero en pagar, el primero en salir). */
export async function listarDespacho(): Promise<FilaDespacho[]> {
  const filas = await db.order.findMany({ where: { estado: { in: [...ESTADOS_DESPACHO] } }, orderBy: { creada: "asc" }, take: 200, select: SELECCION });
  return filas.map(aFila);
}

/**
 * La hoja de bodega de un pedido. Bodega solo abre los que están en despacho; el resto del equipo, los que ya podía ver
 * (un asesor con la visibilidad limitada, solo los suyos).
 */
export async function cargarHoja(id: string, u: { id: string; rol: ActorPedido["rol"] }): Promise<FilaDespacho | null> {
  if (!esBodega(u) && !(await puedeVerPedido(u, id))) return null;
  const o = await db.order.findFirst({ where: { id, ...(esBodega(u) ? { estado: { in: [...ESTADOS_DESPACHO] } } : {}) }, select: SELECCION });
  return o ? aFila(o) : null;
}

type Fallo = { ok: false; error: string };

/** Un paso de bodega sobre un pedido en despacho. Avisa al cliente cuando corresponde (listo para recoger y enviado), como en el detalle. */
export async function avanzarDespacho(pedidoId: string, a: EstadoPedido, guia: string, actor: ActorPedido & { nombre: string }): Promise<{ ok: true; aviso?: ResultadoAviso } | Fallo> {
  if (!(PASOS_BODEGA as readonly EstadoPedido[]).includes(a)) return { ok: false, error: "Ese paso no lo da bodega." };
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true } });
  if (!p || !(ESTADOS_DESPACHO as readonly EstadoPedido[]).includes(p.estado)) return { ok: false, error: "El pedido no existe o no está listo para despachar." };
  return avanzarPedido(pedidoId, a, actor, { guia: a === "enviado" ? guia : undefined });
}
