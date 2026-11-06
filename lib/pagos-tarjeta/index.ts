import { pasarelaSimulada } from "./simulada";
import type { Pasarela } from "./tipos";

export type { EventoPasarela, Pasarela } from "./tipos";

/**
 * La pasarela conectada, o null si no hay ninguna (entonces el pago con tarjeta no se puede encender).
 * PASARELA=simulada solo vale fuera de producción. Un proveedor real se agrega aquí: `if (p === "recurrente") return pasarelaRecurrente;`.
 */
export function pasarela(): Pasarela | null {
  const p = process.env.PASARELA;
  if (p === "simulada" && process.env.NODE_ENV !== "production") return pasarelaSimulada;
  return null;
}
