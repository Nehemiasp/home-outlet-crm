import type { Entrega, EstadoPedido } from "@/generated/prisma/client";

/** Los pasos que ve el cliente del CRM en el detalle: el cuarto depende de si el pedido se envía o se recoge. */
export const pasosDe = (entrega: Entrega) => ["Pendiente de pago", "Pago verificado", "Preparando", entrega === "envio" ? "Enviado" : "Listo para recoger", "Entregado"];

const PASO: Partial<Record<EstadoPedido, number>> = { pendiente_pago: 0, en_revision: 0, pagado: 1, preparando: 2, listo_para_recoger: 3, enviado: 3, entregado: 4 };

/**
 * Dónde está el pedido en la línea de pasos. `historial` son los estados por los que pasó (para un pedido cancelado
 * o vencido, la línea se detiene en el último paso alcanzado). Un borrador todavía no tiene línea.
 */
export function avanceDePedido(estado: EstadoPedido, entrega: Entrega, historial: readonly EstadoPedido[]) {
  if (estado === "borrador") return null;
  const pasos = pasosDe(entrega);
  if (estado === "cancelado" || estado === "vencido") {
    const alcanzado = Math.max(0, ...historial.map((e) => PASO[e] ?? 0));
    return { pasos, actual: alcanzado, detenido: true };
  }
  // «Entregado» es el último paso ya cumplido: no queda ninguno en curso.
  return { pasos, actual: estado === "entregado" ? pasos.length : PASO[estado]!, detenido: false };
}
