import type { Entrega, EstadoPedido } from "@/generated/prisma/client";

/** Los pasos que ve el equipo en el detalle: con envío hay uno más («Pendiente de envío», donde se elige la paquetería). */
export const pasosDe = (entrega: Entrega) =>
  entrega === "envio" ? ["Pendiente de pago", "Pago verificado", "Preparando", "Pendiente de envío", "Enviado", "Entregado"] : ["Pendiente de pago", "Pago verificado", "Preparando", "Listo para recoger", "Entregado"];

const PASO: Partial<Record<EstadoPedido, number>> = { pendiente_pago: 0, en_revision: 0, pagado: 1, preparando: 2, pendiente_envio: 3, listo_para_recoger: 3, enviado: 4, entregado: 5 };
/** El índice del paso; «entregado» es siempre el último (con recoger, la línea tiene un paso menos). */
const pasoDe = (e: EstadoPedido, total: number) => (e === "entregado" ? total - 1 : (PASO[e] ?? 0));

/**
 * Dónde está el pedido en la línea de pasos. `historial` son los estados por los que pasó (para un pedido cancelado
 * o vencido, la línea se detiene en el último paso alcanzado). Un borrador todavía no tiene línea.
 */
export function avanceDePedido(estado: EstadoPedido, entrega: Entrega, historial: readonly EstadoPedido[]) {
  if (estado === "borrador") return null;
  const pasos = pasosDe(entrega);
  if (estado === "cancelado" || estado === "vencido") {
    const alcanzado = Math.max(0, ...historial.map((e) => pasoDe(e, pasos.length)));
    return { pasos, actual: alcanzado, detenido: true };
  }
  // «Entregado» es el último paso ya cumplido: no queda ninguno en curso.
  return { pasos, actual: estado === "entregado" ? pasos.length : pasoDe(estado, pasos.length), detenido: false };
}
