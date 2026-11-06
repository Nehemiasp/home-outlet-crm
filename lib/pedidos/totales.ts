/** Todo en centavos. Solo se calcula en el servidor: el navegador nunca manda totales. */
export type Descuento = { tipo: "monto"; centavos: number } | { tipo: "porcentaje"; porcentaje: number } | null;

export type Totales = { subtotal: number; descuentoMonto: number; costoEnvio: number; total: number };

export function calcularTotales(lineas: readonly { precio: number; cantidad: number }[], descuento: Descuento, costoEnvio: number): Totales {
  const subtotal = lineas.reduce((t, l) => t + l.precio * l.cantidad, 0);
  const bruto = !descuento ? 0 : descuento.tipo === "monto" ? descuento.centavos : Math.round((subtotal * descuento.porcentaje) / 100);
  const descuentoMonto = Math.max(0, Math.min(bruto, subtotal)); // nunca más que el subtotal
  return { subtotal, descuentoMonto, costoEnvio, total: subtotal - descuentoMonto + costoEnvio };
}

/** Un agente puede dar descuento hasta su límite en %; un admin, el que quiera. El límite se compara contra el monto ya calculado. */
export const dentroDelLimite = (descuentoMonto: number, subtotal: number, limitePorcentaje: number) => descuentoMonto * 100 <= subtotal * limitePorcentaje;

/** Lo que falta por pagar: nunca negativo. */
export const saldoDe = (total: number, verificado: number) => Math.max(0, total - verificado);

export type EstadoPagoVista = "sin_pago" | "en_revision" | "parcial" | "pagado" | "rechazado";

/** El estado del pago que se ve en las listas, a partir de los comprobantes del pedido. */
export function estadoDePago(total: number, pagos: readonly { monto: number; estado: "en_revision" | "verificado" | "rechazado" }[]): EstadoPagoVista {
  const verificado = pagos.filter((p) => p.estado === "verificado").reduce((t, p) => t + p.monto, 0);
  if (total > 0 && verificado >= total) return "pagado";
  if (pagos.some((p) => p.estado === "en_revision")) return "en_revision";
  if (verificado > 0) return "parcial";
  if (pagos.length > 0) return "rechazado";
  return "sin_pago";
}
