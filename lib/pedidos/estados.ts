import type { Entrega, EstadoPedido, TipoPago } from "@/generated/prisma/client";

export const ESTADOS: readonly EstadoPedido[] = ["borrador", "pendiente_pago", "en_revision", "pagado", "preparando", "listo_para_recoger", "enviado", "entregado", "cancelado", "vencido"];

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  borrador: "Borrador",
  pendiente_pago: "Pendiente de pago",
  en_revision: "Pago en revisión",
  pagado: "Pagado",
  preparando: "Preparando",
  listo_para_recoger: "Listo para recoger",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

/**
 * Transiciones permitidas. Se validan en el servidor (lib/pedidos/flujo.ts); ocultar botones no basta.
 * - Un rechazo, o un pago parcial verificado, devuelve el pedido a pendiente_pago.
 * - Un pedido vencido se puede reactivar si todavía hay existencias.
 */
const SIGUIENTES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  borrador: ["pendiente_pago", "cancelado"],
  pendiente_pago: ["en_revision", "pagado", "cancelado", "vencido"],
  en_revision: ["pendiente_pago", "pagado", "cancelado"],
  pagado: ["preparando", "cancelado"],
  preparando: ["listo_para_recoger", "enviado", "cancelado"],
  listo_para_recoger: ["entregado"],
  enviado: ["entregado"],
  entregado: [],
  cancelado: [],
  vencido: ["pendiente_pago", "cancelado"],
};

/**
 * Estados a los que puede pasar un pedido. "Listo para recoger" solo existe con entrega en tienda y "enviado" solo con envío.
 * Con pago contra entrega, un pedido pendiente de pago se puede preparar: se envía antes de cobrar.
 */
export function siguientes(de: EstadoPedido, entrega: Entrega, metodo?: TipoPago | null): EstadoPedido[] {
  const extra: EstadoPedido[] = de === "pendiente_pago" && metodo === "contra_entrega" ? ["preparando"] : [];
  return [...extra, ...SIGUIENTES[de]].filter((a) => !(a === "listo_para_recoger" && entrega !== "recoger") && !(a === "enviado" && entrega !== "envio"));
}

export const transicionValida = (de: EstadoPedido, a: EstadoPedido, entrega: Entrega, metodo?: TipoPago | null) => siguientes(de, entrega, metodo).includes(a);

/** Estados que tienen unidades apartadas. */
export const RESERVAN: readonly EstadoPedido[] = ["pendiente_pago", "en_revision"];
/** Estados con el pago ya verificado: las unidades salieron de la existencia. */
export const DESCONTADOS: readonly EstadoPedido[] = ["pagado", "preparando", "listo_para_recoger", "enviado", "entregado"];
