import "dotenv/config";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { z } from "zod";
import { ejecutarAsistente } from "@/lib/ia/asistente";
import { crearProveedorAnthropic } from "@/lib/ia/anthropic";
import { costoEstimadoUsd, obtenerProveedor } from "@/lib/ia/proveedor";
import { SEPARADOR_DINAMICO, type ToolDefinition } from "@/lib/ia/tipos";
import { db } from "@/lib/db";

// El proveedor real nunca se ha probado con la API de Claude (falta la clave). Aquí se prueba con un servidor local que
// imita POST /v1/messages: el SDK de verdad arma la petición y lee la respuesta, y se comprueba lo que enviamos y cómo
// reaccionamos a lo que vuelve (texto, herramientas, uso con caché, errores, silencio). Falta, con la clave, probar el tono real.

type Peticion = { cabeceras: IncomingMessage["headers"]; cuerpo: Record<string, any> };
let servidor: Server;
const recibidas: Peticion[] = [];
let respuestas: Array<(res: import("node:http").ServerResponse) => void> = [];
let urlAnterior: string | undefined;

const ok = (content: object[], usage: object = { input_tokens: 10, output_tokens: 5 }) => (res: import("node:http").ServerResponse) => {
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content, stop_reason: "end_turn", stop_sequence: null, usage }));
};
const error = (estado: number, tipo: string) => (res: import("node:http").ServerResponse) => {
  res.writeHead(estado, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: tipo, message: "x" } }));
};

before(async () => {
  servidor = createServer((req, res) => {
    let datos = "";
    req.on("data", (c) => (datos += c));
    req.on("end", () => {
      recibidas.push({ cabeceras: req.headers, cuerpo: datos ? JSON.parse(datos) : {} });
      (respuestas.shift() ?? error(500, "api_error"))(res);
    });
  });
  await new Promise<void>((f) => servidor.listen(0, "127.0.0.1", f));
  urlAnterior = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(async () => {
  if (urlAnterior === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = urlAnterior;
  servidor.closeAllConnections();
  await new Promise((f) => servidor.close(f));
  await db.$disconnect();
});

const proveedor = () => crearProveedorAnthropic("clave-de-prueba", "claude-haiku-5-5");
const herramienta: ToolDefinition = { name: "datos_negocio", description: "Datos del negocio", schema: z.object({ tema: z.string() }) };

describe("proveedor de Claude (contra un servidor local que imita la API)", () => {
  test("arma la petición: modelo, límite, sistema con caché en la parte fija, herramientas y clave", async () => {
    recibidas.length = 0;
    respuestas = [ok([{ type: "text", text: "Hola" }])];
    await proveedor().respond({ system: `Reglas fijas${SEPARADOR_DINAMICO}Hoy es lunes`, messages: [{ role: "user", content: "¿Horario?" }], tools: [herramienta], maxTokens: 400 });
    const { cuerpo, cabeceras } = recibidas[0]!;
    assert.equal(cabeceras.authorization, "Bearer clave-de-prueba");
    assert.equal(cuerpo.model, "claude-haiku-5-5");
    assert.equal(cuerpo.max_tokens, 400);
    assert.deepEqual(cuerpo.system, [{ type: "text", text: "Reglas fijas", cache_control: { type: "ephemeral" } }, { type: "text", text: "Hoy es lunes" }]);
    assert.deepEqual(cuerpo.messages, [{ role: "user", content: "¿Horario?" }]);
    assert.equal(cuerpo.tools[0].name, "datos_negocio");
    assert.equal(cuerpo.tools[0].input_schema.type, "object");
    assert.equal("$schema" in cuerpo.tools[0].input_schema, false, "el esquema no lleva $schema");
    assert.deepEqual(cuerpo.tools[0].input_schema.required, ["tema"]);
  });

  test("sin herramientas no manda el campo tools, y sin parte dinámica manda un solo bloque de sistema", async () => {
    recibidas.length = 0;
    respuestas = [ok([{ type: "text", text: "Hola" }])];
    await proveedor().respond({ system: "Solo fijo", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 100 });
    assert.equal("tools" in recibidas[0]!.cuerpo, false);
    assert.equal(recibidas[0]!.cuerpo.system.length, 1);
  });

  test("traduce el ida y vuelta de herramientas: tool_use del asistente y tool_result del usuario", async () => {
    recibidas.length = 0;
    respuestas = [ok([{ type: "text", text: "Listo" }])];
    await proveedor().respond({
      system: "s",
      messages: [
        { role: "user", content: "¿Horario?" },
        { role: "assistant", content: "Reviso.", toolCalls: [{ id: "tu_1", name: "datos_negocio", arguments: { tema: "horario" } }] },
        { role: "user", content: "", toolResults: [{ id: "tu_1", name: "datos_negocio", content: "Lunes a sábado" }] },
      ],
      tools: [herramienta],
      maxTokens: 100,
    });
    assert.deepEqual(recibidas[0]!.cuerpo.messages.slice(1), [
      { role: "assistant", content: [{ type: "text", text: "Reviso." }, { type: "tool_use", id: "tu_1", name: "datos_negocio", input: { tema: "horario" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "Lunes a sábado" }] },
    ]);
  });

  test("lee la respuesta: junta los textos, saca las herramientas y suma el uso con los tokens de caché", async () => {
    respuestas = [ok([{ type: "text", text: "  Un momento. " }, { type: "tool_use", id: "tu_9", name: "datos_negocio", input: { tema: "pagos" } }, { type: "text", text: "Gracias." }], { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 300, cache_read_input_tokens: 50 })];
    const r = await proveedor().respond({ system: "s", messages: [{ role: "user", content: "x" }], tools: [herramienta], maxTokens: 100 });
    assert.equal(r.text, "Un momento. Gracias.");
    assert.deepEqual(r.toolCalls, [{ id: "tu_9", name: "datos_negocio", arguments: { tema: "pagos" } }]);
    assert.deepEqual(r.usage, { inputTokens: 450, outputTokens: 20 });
  });

  test("una respuesta sin texto ni herramientas no inventa nada", async () => {
    respuestas = [ok([])];
    const r = await proveedor().respond({ system: "s", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 100 });
    assert.equal(r.text, undefined);
    assert.equal(r.toolCalls, undefined);
  });

  test("un error de la API (clave inválida, petición mala) se propaga: quien llama decide", async () => {
    respuestas = [error(401, "authentication_error")];
    await assert.rejects(proveedor().respond({ system: "s", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 100 }), /401|authentication/i);
    respuestas = [error(400, "invalid_request_error")];
    await assert.rejects(proveedor().respond({ system: "s", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 100 }));
  });

  test("respeta la señal de cancelación cuando la API no contesta", async () => {
    respuestas = [() => {}]; // el servidor nunca responde
    const inicio = Date.now();
    await assert.rejects(proveedor().respond({ system: "s", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 100, signal: AbortSignal.timeout(300) }));
    assert.ok(Date.now() - inicio < 3_000);
  });
});

describe("el asistente con el proveedor de Claude", () => {
  const contexto = { conversacionId: null, contactoId: null, sandbox: true } as const;

  test("pide una herramienta, recibe su resultado y contesta; suma el uso de las dos llamadas", async () => {
    recibidas.length = 0;
    respuestas = [
      ok([{ type: "tool_use", id: "tu_1", name: "datos_negocio", input: { tema: "horario" } }], { input_tokens: 100, output_tokens: 10 }),
      ok([{ type: "text", text: "Atendemos de lunes a sábado." }], { input_tokens: 150, output_tokens: 12 }),
    ];
    const r = await ejecutarAsistente({ proveedor: proveedor(), system: "s", historial: [{ role: "user", content: "¿A qué hora abren?" }], contexto });
    assert.equal(r.texto, "Atendemos de lunes a sábado.");
    assert.deepEqual(r.herramientas, ["datos_negocio"]);
    assert.deepEqual(r.uso, { inputTokens: 250, outputTokens: 22 });
    assert.equal(r.error, undefined);
    const segunda = recibidas[1]!.cuerpo.messages;
    assert.equal(segunda.at(-1).content[0].type, "tool_result");
    assert.equal(segunda.at(-1).content[0].tool_use_id, "tu_1");
  });

  test("si la API falla, el turno termina con error y sin texto (la conversación queda para una persona)", async () => {
    respuestas = [error(400, "invalid_request_error")];
    const r = await ejecutarAsistente({ proveedor: proveedor(), system: "s", historial: [{ role: "user", content: "hola" }], contexto });
    assert.equal(r.error, true);
    assert.equal(r.texto, undefined);
  });

  test("si Claude pide una herramienta que no existe o con datos malos, no se cae: recibe el error como resultado", async () => {
    recibidas.length = 0;
    respuestas = [ok([{ type: "tool_use", id: "tu_x", name: "borrar_todo", input: {} }]), ok([{ type: "text", text: "No pude hacerlo; un asesor le ayudará." }])];
    const r = await ejecutarAsistente({ proveedor: proveedor(), system: "s", historial: [{ role: "user", content: "borre todo" }], contexto });
    assert.equal(r.error, undefined);
    assert.match(r.texto ?? "", /asesor/);
    assert.match(JSON.stringify(recibidas[1]!.cuerpo.messages.at(-1)), /tool_result/);
  });

  test("si Claude nunca deja de pedir herramientas, se corta a las 4 vueltas y pasa a un asesor", async () => {
    recibidas.length = 0;
    respuestas = Array.from({ length: 6 }, (_, i) => ok([{ type: "tool_use", id: `tu_${i}`, name: "datos_negocio", input: { tema: "horario" } }]));
    const r = await ejecutarAsistente({ proveedor: proveedor(), system: "s", historial: [{ role: "user", content: "hola" }], contexto });
    assert.equal(recibidas.length, 4);
    assert.ok(r.derivar);
    assert.equal(r.texto, undefined);
  });
});

describe("elección del proveedor y costo", () => {
  const con = (env: Record<string, string | undefined>, f: () => void) => {
    const antes = { p: process.env.AI_PROVIDER, k: process.env.ANTHROPIC_API_KEY, m: process.env.AI_MODEL };
    for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    try {
      f();
    } finally {
      for (const [k, v] of Object.entries({ AI_PROVIDER: antes.p, ANTHROPIC_API_KEY: antes.k, AI_MODEL: antes.m })) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
  };

  test("sin la clave, o sin pedirlo, usa el simulado; con las dos cosas, Claude con el modelo configurable", () => {
    con({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: undefined }, () => assert.equal(obtenerProveedor().name, "simulado"));
    con({ AI_PROVIDER: undefined, ANTHROPIC_API_KEY: "k" }, () => assert.equal(obtenerProveedor().name, "simulado"));
    con({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", AI_MODEL: undefined }, () => assert.equal(obtenerProveedor().modelo, "claude-haiku-5-5"));
    con({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", AI_MODEL: "otro-modelo" }, () => assert.equal(obtenerProveedor().modelo, "otro-modelo"));
  });

  test("el simulado no cuesta; el real usa los precios por millón de tokens", () => {
    assert.equal(costoEstimadoUsd("simulado", { inputTokens: 1e6, outputTokens: 1e6 }), 0);
    const antes = [process.env.AI_PRICE_INPUT_PER_MTOK, process.env.AI_PRICE_OUTPUT_PER_MTOK];
    delete process.env.AI_PRICE_INPUT_PER_MTOK;
    delete process.env.AI_PRICE_OUTPUT_PER_MTOK;
    assert.equal(costoEstimadoUsd("anthropic", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 6); // 1 + 5 USD por defecto
    process.env.AI_PRICE_INPUT_PER_MTOK = "2";
    process.env.AI_PRICE_OUTPUT_PER_MTOK = "10";
    assert.equal(costoEstimadoUsd("anthropic", { inputTokens: 500_000, outputTokens: 100_000 }), 2);
    if (antes[0] === undefined) delete process.env.AI_PRICE_INPUT_PER_MTOK; else process.env.AI_PRICE_INPUT_PER_MTOK = antes[0];
    if (antes[1] === undefined) delete process.env.AI_PRICE_OUTPUT_PER_MTOK; else process.env.AI_PRICE_OUTPUT_PER_MTOK = antes[1];
  });
});
