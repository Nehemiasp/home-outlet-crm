import { crearProveedorAnthropic } from "./anthropic";
import { proveedorSimulado } from "./simulado";
import type { AiProvider } from "./tipos";

export const MODELO_POR_DEFECTO = "claude-haiku-5-5";

/**
 * AI_PROVIDER=anthropic con ANTHROPIC_API_KEY usa la API real; en cualquier otro caso se usa el simulado.
 * El modelo sale de AI_MODEL (por defecto uno pequeño y económico) y se cambia sin tocar código.
 */
export function obtenerProveedor(): AiProvider {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (process.env.AI_PROVIDER === "anthropic" && clave) return crearProveedorAnthropic(clave, process.env.AI_MODEL || MODELO_POR_DEFECTO);
  return proveedorSimulado;
}

export const modoDePrueba = () => obtenerProveedor().name === "simulado";

/** Costo estimado en dólares. Los precios por millón de tokens son configurables porque cambian según el modelo. */
export function costoEstimadoUsd(proveedor: AiProvider["name"], uso: { inputTokens: number; outputTokens: number }) {
  if (proveedor === "simulado") return 0;
  const entrada = Number(process.env.AI_PRICE_INPUT_PER_MTOK) || 1;
  const salida = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK) || 5;
  return (uso.inputTokens * entrada + uso.outputTokens * salida) / 1_000_000;
}
