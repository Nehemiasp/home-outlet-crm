import { HERRAMIENTAS, ejecutarHerramienta, type ContextoHerramienta } from "./herramientas";
import type { AiProvider, MensajeIa, UsoIa } from "./tipos";

export const TIEMPO_MAXIMO_MS = 20_000;
const MAX_VUELTAS = 4;
const MAX_TOKENS = 400;

export type ResultadoAsistente = {
  texto?: string;
  /** Motivo por el que el asistente decidió pasar la conversación a un asesor. */
  derivar?: string;
  error?: boolean;
  uso: Required<UsoIa>;
  ms: number;
  herramientas: string[];
  consultado: string[];
  productos: string[];
  sinRespuesta: boolean;
  mensajesEnviados: string[];
  /** Las tarjetas de producto que mandó (o mandaría, en prueba), con sus fotos, en orden. */
  tarjetas: { productoId: string; fotos: string[] }[];
};

const SOLO_LECTURA = new Set(["buscar_productos", "ver_producto", "datos_negocio", "buscar_respuesta", "estado_pedido"]);

/**
 * Un turno del asistente: llama al proveedor, ejecuta las herramientas que pida y repite hasta que haya un texto final
 * o se decida pasar a un asesor. No toca la base salvo por las herramientas, y en modo `sandbox` ni eso.
 */
export async function ejecutarAsistente(p: {
  proveedor: AiProvider;
  system: string;
  historial: MensajeIa[];
  contexto: Omit<ContextoHerramienta, "aiRunId">;
  /** En sugerencias el asistente solo puede consultar: no envía ni deriva. */
  soloLectura?: boolean;
}): Promise<ResultadoAsistente> {
  const inicio = Date.now();
  const mensajes = [...p.historial];
  const herramientas = p.soloLectura ? HERRAMIENTAS.filter((t) => SOLO_LECTURA.has(t.name)) : HERRAMIENTAS;
  const r: ResultadoAsistente = { uso: { inputTokens: 0, outputTokens: 0, cacheEscritos: 0, cacheLeidos: 0 }, ms: 0, herramientas: [], consultado: [], productos: [], sinRespuesta: false, mensajesEnviados: [], tarjetas: [] };
  const resultadosVacios: boolean[] = [];

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const senal = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
      const respuesta = await Promise.race([
        p.proveedor.respond({ system: p.system, messages: mensajes, tools: herramientas, maxTokens: MAX_TOKENS, signal: senal }),
        new Promise<never>((_, rechazar) => senal.addEventListener("abort", () => rechazar(new Error("Tiempo agotado")))),
      ]);
      r.uso.inputTokens += respuesta.usage.inputTokens;
      r.uso.outputTokens += respuesta.usage.outputTokens;
      r.uso.cacheEscritos += respuesta.usage.cacheEscritos ?? 0;
      r.uso.cacheLeidos += respuesta.usage.cacheLeidos ?? 0;

      if (!respuesta.toolCalls?.length) {
        r.texto = respuesta.text?.trim() || undefined;
        break;
      }

      mensajes.push({ role: "assistant", content: respuesta.text ?? "", toolCalls: respuesta.toolCalls });
      const resultados: NonNullable<MensajeIa["toolResults"]> = [];
      for (const llamada of respuesta.toolCalls) {
        const h = await ejecutarHerramienta(llamada.name, llamada.arguments, p.contexto);
        r.herramientas.push(llamada.name);
        if (h.consultado) r.consultado.push(h.consultado);
        if (h.productos) r.productos.push(...h.productos);
        if (h.mensajesEnviados) r.mensajesEnviados.push(...h.mensajesEnviados);
        if (h.tarjeta) r.tarjetas.push(h.tarjeta);
        if (SOLO_LECTURA.has(llamada.name)) resultadosVacios.push(!!h.sinResultado);
        if (h.derivar) r.derivar = h.derivar;
        resultados.push({ id: llamada.id, name: llamada.name, content: h.contenido });
      }
      if (r.derivar) break;
      mensajes.push({ role: "user", content: "", toolResults: resultados });
    }
    if (!r.texto && !r.derivar) r.derivar = "el asistente no pudo responder";
  } catch {
    r.error = true;
  }

  // "No logró responder": consultó y todo volvió vacío.
  r.sinRespuesta = resultadosVacios.length > 0 && resultadosVacios.every(Boolean) && !r.derivar;
  r.productos = [...new Set(r.productos)];
  r.ms = Date.now() - inicio;
  return r;
}
