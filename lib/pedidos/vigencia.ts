// Cuánto vale una cotización. Funciones puras (sin base de datos) para usarlas en el servidor y en las pruebas.
import type { EstadoCotizacionVista } from "./tipos";

const ZONA = "America/Guatemala";

/**
 * Hasta cuándo vale una cotización enviada `ahora`: hasta el final del día, en hora de Guatemala, que cae `dias` días después.
 * Enviada el lunes con 3 días, vale hasta el jueves a las 23:59. Así el cliente lee una fecha, no una hora.
 */
export function finDeVigencia(ahora: Date, dias: number): Date {
  const dia = new Date(ahora.getTime() + dias * 86_400_000).toLocaleDateString("en-CA", { timeZone: ZONA }); // AAAA-MM-DD
  return new Date(`${dia}T23:59:59.999-06:00`); // Guatemala no tiene horario de verano
}

/** «jueves 12 de noviembre», como se le escribe al cliente. */
export const textoFecha = (d: Date) => d.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).replace(",", "");

/** Una cotización enviada que pasó su fecha se ve como vencida; la que se convirtió en pedido, como aceptada. */
export function estadoDeCotizacion(c: { estado: "enviada" | "aceptada"; validaHasta: Date }, ahora = new Date()): EstadoCotizacionVista {
  if (c.estado === "aceptada") return "aceptada";
  return c.validaHasta < ahora ? "vencida" : "vigente";
}
