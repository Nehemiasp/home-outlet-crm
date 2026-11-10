import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ejecutarAsistente } from "@/lib/ia/asistente";
import { esIngles } from "@/lib/ia/texto";
import type { AiProvider } from "@/lib/ia/tipos";

// Con todo el contexto en español, el modelo real a veces contestaba en español a un mensaje en inglés. Si el último mensaje del
// cliente está en inglés, el asistente se lo dice al modelo al final de las instrucciones. No usa base de datos.

describe("idioma de la respuesta", () => {
  const recibido: string[] = [];
  const proveedor: AiProvider = {
    name: "simulado",
    modelo: "prueba",
    respond: async ({ system }) => {
      recibido.push(system);
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const turno = (mensaje: string, previo?: string) =>
    ejecutarAsistente({ proveedor, system: "REGLAS", historial: [...(previo ? [{ role: "user" as const, content: previo }] : []), { role: "user", content: mensaje }], contexto: { conversacionId: null, contactoId: null, sandbox: true } });

  test("detecta el inglés por palabras frecuentes, y ante la duda es español", () => {
    assert.equal(esIngles("What are your opening hours?"), true);
    assert.equal(esIngles("Hello, how much is the bluetooth speaker?"), true);
    assert.equal(esIngles("¿Cuál es el horario?"), false);
    assert.equal(esIngles("hola, hours?"), false); // mezcla con español: español
    assert.equal(esIngles("ok"), false);
  });

  test("con el último mensaje en inglés, las instrucciones terminan pidiendo responder en inglés", async () => {
    recibido.length = 0;
    await turno("What are your opening hours?");
    assert.ok(recibido[0]!.startsWith("REGLAS")); // las reglas fijas quedan igual (el caché no cambia)
    assert.match(recibido[0]!, /writing in English/);
    await turno("¿Cuál es el horario?", "What are your opening hours?"); // cuenta el último mensaje, no los anteriores
    assert.equal(recibido[1], "REGLAS");
  });
});
