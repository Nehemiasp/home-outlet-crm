import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, describe, test } from "node:test";
import { adaptador, canalesHabilitados } from "@/lib/canales";
import { adaptadorSimulado } from "@/lib/canales/simulado";
import { VENTANA_MS, msRestantes, textoRestante, ventanaAbierta } from "@/lib/canales/ventana";
import { firmaValida } from "@/lib/canales/whatsapp";
import { db } from "@/lib/db";
import { recibirMensaje } from "@/lib/mensajeria";
import { normalizarTelefono } from "@/lib/telefono";

const ahora = new Date("2026-10-30T12:00:00Z");
const haceHoras = (h: number) => new Date(ahora.getTime() - h * 3600_000);

describe("ventana de 24 horas", () => {
  test("sin mensaje del cliente, está cerrada", () => assert.equal(ventanaAbierta(null, ahora), false));
  test("a las 23 h 59 min sigue abierta", () => assert.equal(ventanaAbierta(new Date(ahora.getTime() - (VENTANA_MS - 60_000)), ahora), true));
  test("a las 24 h exactas se cierra", () => assert.equal(msRestantes(haceHoras(24), ahora), 0));
  test("pasadas las 24 h está cerrada", () => assert.equal(ventanaAbierta(haceHoras(24.02), ahora), false));
  test("texto de tiempo restante", () => {
    assert.equal(textoRestante(8_100_000), "2 h 15 min");
    assert.equal(textoRestante(3_600_000), "1 h");
    assert.equal(textoRestante(45 * 60_000), "45 min");
    assert.equal(textoRestante(30_000), "1 min");
  });
});

describe("teléfonos", () => {
  test("formatos de Guatemala", () => {
    for (const t of ["5555 1234", "55551234", "+502 5555 1234", "502-5555-1234", "(502) 5555 1234", "00502 55551234"]) {
      assert.equal(normalizarTelefono(t), "+50255551234", t);
    }
  });
  test("otros países con +", () => assert.equal(normalizarTelefono("+1 (415) 555-2671"), "+14155552671"));
  test("rechaza lo inválido", () => {
    for (const t of ["", "abc", "1234", "555512", "+0123456789", "155551234"]) assert.equal(normalizarTelefono(t), null, t);
  });
});

describe("interfaz de canales", () => {
  test("CHANNELS_ENABLED ignora espacios, mayúsculas y canales desconocidos", () => {
    assert.deepEqual([...canalesHabilitados(" simulado, WhatsApp ,xyz")].sort(), ["simulado", "whatsapp"]);
  });
  test("un canal habilitado sin credenciales o sin adaptador no se entrega", () => {
    process.env.CHANNELS_ENABLED = "simulado,whatsapp,tiktok";
    for (const v of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]) delete process.env[v];
    assert.ok(adaptador("simulado"));
    assert.equal(adaptador("whatsapp"), null);
    assert.equal(adaptador("tiktok"), null);
    assert.equal(adaptador("facebook"), null);
  });
  test("el adaptador simulado respeta la ventana de 24 horas", () => {
    assert.equal(adaptadorSimulado.canSendFreeForm({ lastInboundAt: new Date() }), true);
    assert.equal(adaptadorSimulado.canSendFreeForm({ lastInboundAt: new Date(Date.now() - 25 * 3600_000) }), false);
    assert.equal(adaptadorSimulado.canSendFreeForm({ lastInboundAt: null }), false);
  });
  test("el adaptador simulado lee el webhook y rechaza cuerpos inválidos", async () => {
    const pedir = (cuerpo: unknown) => new Request("http://x/api/webhooks/simulado", { method: "POST", body: JSON.stringify(cuerpo) });
    const { messages } = await adaptadorSimulado.parseWebhook(pedir({ externalContactId: "+50255550001", text: "Hola" }));
    assert.equal(messages[0]?.text, "Hola");
    assert.equal(messages[0]?.channel, "simulado");
    await assert.rejects(adaptadorSimulado.parseWebhook(pedir({ text: "" })));
  });
});

describe("firma de WhatsApp (X-Hub-Signature-256)", () => {
  const cuerpo = '{"entry":[]}';
  const buena = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  test("acepta la firma correcta", () => assert.equal(firmaValida(cuerpo, buena, "secreto"), true));
  test("rechaza otro secreto, otro cuerpo o cabecera ausente", () => {
    assert.equal(firmaValida(cuerpo, buena, "otro"), false);
    assert.equal(firmaValida(cuerpo + " ", buena, "secreto"), false);
    assert.equal(firmaValida(cuerpo, null, "secreto"), false);
    assert.equal(firmaValida(cuerpo, "sha256=zz", "secreto"), false);
  });
});

// Necesita la base de datos (npm run db). Limpia lo que crea.
describe("mensaje entrante", () => {
  const tel = "+50255559999";
  after(async () => {
    await db.contact.deleteMany({ where: { telefono: tel } });
    await db.$disconnect();
  });

  test("es idempotente y reabre conversaciones cerradas", async () => {
    const m = { channel: "simulado" as const, externalContactId: tel, contactName: "Prueba automática", externalMessageId: `test-${Date.now()}`, type: "text" as const, text: "Hola", timestamp: new Date() };
    const a = await recibirMensaje(m);
    const b = await recibirMensaje(m);
    assert.equal(a.duplicado, false);
    assert.equal(b.duplicado, true);

    await db.conversation.update({ where: { id: a.conversacionId! }, data: { estado: "cerrada", noLeidos: 0 } });
    await recibirMensaje({ ...m, externalMessageId: `test-${Date.now()}-2` });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: a.conversacionId! }, include: { _count: { select: { mensajes: true } } } });
    assert.equal(conv.estado, "abierta");
    assert.equal(conv.noLeidos, 1);
    assert.equal(conv._count.mensajes, 2);
  });
});
