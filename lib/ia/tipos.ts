import type { z } from "zod";

export type ToolDefinition = { name: string; description: string; schema: z.ZodType };

export type LlamadaHerramienta = { id: string; name: string; arguments: unknown };

/**
 * Mensaje de la conversación que se le pasa al proveedor.
 * Cuando el asistente usa una herramienta, el mensaje del asistente lleva `toolCalls` y el siguiente, del usuario, lleva `toolResults`.
 */
export type MensajeIa = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: LlamadaHerramienta[];
  toolResults?: { id: string; name: string; content: string }[];
};

/**
 * Tokens de una llamada. `inputTokens` es toda la entrada (con lo que pasó por el caché); `cacheEscritos` y `cacheLeidos`
 * son la parte de esa entrada que se guardó en caché o se leyó de él, porque se cobran distinto (ver costoEstimadoUsd).
 */
export type UsoIa = { inputTokens: number; outputTokens: number; cacheEscritos?: number; cacheLeidos?: number };

export interface AiProvider {
  name: "simulado" | "anthropic";
  modelo: string;
  respond(input: { system: string; messages: MensajeIa[]; tools: ToolDefinition[]; maxTokens: number; signal?: AbortSignal }): Promise<{
    text?: string;
    toolCalls?: LlamadaHerramienta[];
    usage: UsoIa;
  }>;
}

/** Separa la parte fija del mensaje de sistema (que se guarda en caché) de la que cambia en cada llamada. */
export const SEPARADOR_DINAMICO = "\n<<<DINAMICO>>>\n";

/** Marcas que le indican al proveedor qué trabajo se le pide además de atender a un cliente. */
export const MODO = { sugerencia: "[MODO: SUGERENCIA]", resumen: "[MODO: RESUMEN]", motivo: "[MODO: MOTIVO]" } as const;

export const MOTIVOS = ["precio", "existencia", "envio", "horario", "compra", "reclamo", "garantia", "otro"] as const;
export type MotivoIa = (typeof MOTIVOS)[number];
export const ETIQUETA_MOTIVO: Record<MotivoIa, string> = { precio: "Precio", existencia: "Existencia", envio: "Envío", horario: "Horario", compra: "Compra", reclamo: "Reclamo", garantia: "Garantía", otro: "Otro" };
