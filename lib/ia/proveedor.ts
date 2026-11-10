import { crearProveedorAnthropic } from "./anthropic";
import { proveedorSimulado } from "./simulado";
import type { AiProvider, UsoIa } from "./tipos";

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

/**
 * Precios de fábrica por millón de tokens: los de Claude Haiku 5.5, el modelo por defecto (USD 0.10 de entrada y 0.50 de salida,
 * para prompts de hasta 100K tokens; los del asistente son mucho más cortos). Con el presupuesto mensual se apaga el asistente,
 * así que deben coincidir con el modelo en uso: si se cambia AI_MODEL, cambiar también AI_PRICE_INPUT_PER_MTOK y AI_PRICE_OUTPUT_PER_MTOK.
 */
export const PRECIO_ENTRADA_POR_DEFECTO = 0.1;
export const PRECIO_SALIDA_POR_DEFECTO = 0.5;

/**
 * Lo que cuesta el caché respecto del precio de entrada: guardar (caché de 5 minutos) 1.25 veces y leer 0.1 veces.
 * Son los de Claude Haiku 5.5; Opus 5.5 y Sonnet 5.5 cobran la lectura aún más barata (0.05), así que con ellos el cálculo
 * queda un poco por encima del real, del lado seguro para el tope mensual.
 */
export const FACTOR_CACHE_ESCRITO = 1.25;
export const FACTOR_CACHE_LEIDO = 0.1;

/**
 * Costo estimado en dólares. Los precios por millón de tokens son configurables porque cambian según el modelo.
 * La entrada que pasó por el caché se cobra con sus factores (antes se cobraba completa y el tope se alcanzaba unas 5 veces
 * antes de tiempo: con la API real, 2,380 de cada ~2,480 tokens de entrada se leen del caché).
 */
export function costoEstimadoUsd(proveedor: AiProvider["name"], uso: UsoIa) {
  if (proveedor === "simulado") return 0;
  const entrada = Number(process.env.AI_PRICE_INPUT_PER_MTOK) || PRECIO_ENTRADA_POR_DEFECTO;
  const salida = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK) || PRECIO_SALIDA_POR_DEFECTO;
  const escritos = uso.cacheEscritos ?? 0;
  const leidos = uso.cacheLeidos ?? 0;
  const normales = Math.max(0, uso.inputTokens - escritos - leidos);
  const tokensEntrada = normales + escritos * FACTOR_CACHE_ESCRITO + leidos * FACTOR_CACHE_LEIDO; // en «tokens a precio normal»
  return (tokensEntrada * entrada + uso.outputTokens * salida) / 1_000_000;
}
