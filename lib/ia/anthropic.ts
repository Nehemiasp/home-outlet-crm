import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SEPARADOR_DINAMICO, type AiProvider, type MensajeIa, type ToolDefinition } from "./tipos";

/** Proveedor real: la API de Claude con uso de herramientas. La parte fija del mensaje de sistema se guarda en caché (prompt caching). */
export function crearProveedorAnthropic(apiKey: string, modelo: string): AiProvider {
  const cliente = new Anthropic({ apiKey });

  const aMensajes = (mensajes: MensajeIa[]) =>
    mensajes.map((m) => {
      if (m.toolResults) return { role: "user" as const, content: m.toolResults.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content })) };
      if (m.toolCalls) {
        return {
          role: "assistant" as const,
          content: [...(m.content ? [{ type: "text" as const, text: m.content }] : []), ...m.toolCalls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: (c.arguments ?? {}) as Record<string, unknown> }))],
        };
      }
      return { role: m.role, content: m.content };
    });

  const aHerramientas = (tools: ToolDefinition[]) =>
    tools.map((t) => {
      const { $schema: _omitido, ...esquema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
      return { name: t.name, description: t.description, input_schema: esquema as { type: "object" } };
    });

  return {
    name: "anthropic",
    modelo,
    async respond({ system, messages, tools, maxTokens, signal }) {
      const [fijo = "", dinamico] = system.split(SEPARADOR_DINAMICO);
      const r = await cliente.messages.create(
        {
          model: modelo,
          max_tokens: maxTokens,
          system: [{ type: "text", text: fijo, cache_control: { type: "ephemeral" } }, ...(dinamico ? [{ type: "text" as const, text: dinamico }] : [])],
          messages: aMensajes(messages),
          ...(tools.length ? { tools: aHerramientas(tools) } : {}),
        },
        { signal },
      );
      const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      const llamadas = r.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, arguments: b.input }] : []));
      const u = r.usage;
      return {
        text: texto || undefined,
        toolCalls: llamadas.length ? llamadas : undefined,
        usage: { inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), outputTokens: u.output_tokens },
      };
    },
  };
}
