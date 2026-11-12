import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import { almacenamiento } from "@/lib/almacenamiento";
import { adaptador, estadoCanales } from "@/lib/canales";
import { adaptadorYCloud, firmaYCloudValida, interpretarEventoYCloud } from "@/lib/canales/ycloud";
import { db } from "@/lib/db";
import { guardarSincronizado, recibirMensaje } from "@/lib/mensajeria";

// YCloud se simula cambiando fetch: no sale ninguna llamada a internet. Las pruebas de guardado usan la base (npm run db) y
// borran lo que crean (teléfonos +50299996xxx, prefijo PRUEBA-YC).

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const CLAVE = "clave-ycloud-secreta";
const SECRETO = "whsec_prueba";
const NEGOCIO = "+50247532936";
const CLIENTE = "+50299996001";

type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[] = [];
const fetchReal = globalThis.fetch;
const simular = (responder: (u: string, init: RequestInit) => Response | Promise<Response>) => {
  llamadas = [];
  globalThis.fetch = (async (u: string | URL, init: RequestInit = {}) => {
    llamadas.push({ url: String(u), init });
    return responder(String(u), init);
  }) as typeof fetch;
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const firmar = (cuerpo: string, t = Math.floor(Date.now() / 1000), secreto = SECRETO) => `t=${t},s=${createHmac("sha256", secreto).update(`${t}.`).update(cuerpo).digest("hex")}`;

const ENV = { CHANNELS_ENABLED: "whatsapp", WHATSAPP_PROVEEDOR: "ycloud", YCLOUD_API_KEY: CLAVE, YCLOUD_WEBHOOK_SECRET: SECRETO, YCLOUD_NUMERO: NEGOCIO };
const previo = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
before(() => Object.assign(process.env, ENV));
afterEach(() => {
  globalThis.fetch = fetchReal;
});
after(() => {
  for (const [k, v] of Object.entries(previo)) v === undefined ? delete process.env[k] : (process.env[k] = v);
});

describe("YCloud: firma del webhook", () => {
  const cuerpo = JSON.stringify({ id: "evt_1", type: "whatsapp.inbound_message.received" });
  test("acepta la firma correcta y rechaza secreto equivocado, hora vieja o cabecera mal formada", () => {
    assert.equal(firmaYCloudValida(cuerpo, firmar(cuerpo), SECRETO), true);
    assert.equal(firmaYCloudValida(cuerpo, firmar(cuerpo, undefined, "otro"), SECRETO), false);
    assert.equal(firmaYCloudValida(cuerpo, firmar(cuerpo, Math.floor(Date.now() / 1000) - 600), SECRETO), false); // más de 5 minutos
    assert.equal(firmaYCloudValida(cuerpo + " ", firmar(cuerpo), SECRETO), false); // el cuerpo cambió
    assert.equal(firmaYCloudValida(cuerpo, "s=abc", SECRETO), false);
    assert.equal(firmaYCloudValida(cuerpo, null, SECRETO), false);
  });
  test("verifyWebhook lee la cabecera YCloud-Signature", async () => {
    const req = (firma: string) => new Request("https://crm/api/webhooks/whatsapp", { method: "POST", body: cuerpo, headers: { "YCloud-Signature": firma } });
    assert.equal(await adaptadorYCloud.verifyWebhook(req(firmar(cuerpo))), true);
    assert.equal(await adaptadorYCloud.verifyWebhook(req(firmar(cuerpo, undefined, "otro"))), false);
  });
});

describe("YCloud: el canal WhatsApp usa YCloud con WHATSAPP_PROVEEDOR=ycloud", () => {
  test("con sus tres variables queda activo; sin una, pendiente y diciendo cuál falta", () => {
    assert.equal(adaptador("whatsapp"), adaptadorYCloud);
    delete process.env.YCLOUD_WEBHOOK_SECRET;
    assert.equal(adaptador("whatsapp"), null);
    assert.deepEqual(estadoCanales().find((c) => c.canal === "whatsapp")?.faltantes, ["YCLOUD_WEBHOOK_SECRET"]);
    process.env.YCLOUD_WEBHOOK_SECRET = SECRETO;
  });
});

describe("YCloud: eventos que llegan", () => {
  const archivos: string[] = [];
  after(async () => {
    for (const a of archivos) await unlink(path.join(process.cwd(), "uploads", a)).catch(() => {});
  });

  test("mensaje de texto del cliente: con «+», el nombre del perfil y el wamid; si va a otro número, se ignora", async () => {
    const evento = (to: string) => ({
      id: "evt_a", type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: { id: "yc1", wamid: "wamid.A", from: "50299996001", to, sendTime: "2026-11-11T18:00:00.000Z", type: "text", text: { body: "Hola" }, customerProfile: { name: "Ana" } },
    });
    const r = await interpretarEventoYCloud(evento(NEGOCIO));
    assert.deepEqual(r.messages, [{ channel: "whatsapp", externalContactId: CLIENTE, contactName: "Ana", externalMessageId: "wamid.A", timestamp: new Date("2026-11-11T18:00:00.000Z"), type: "text", text: "Hola" }]);
    assert.equal((await interpretarEventoYCloud(evento("+50211112222"))).messages.length, 0);
  });

  test("imagen del cliente: se descarga con la clave (solo de api.ycloud.com) y se guarda", async () => {
    simular(() => new Response(new Uint8Array(PNG)));
    const r = await interpretarEventoYCloud({
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: { wamid: "wamid.IMG", from: "+50299996001", to: NEGOCIO, type: "image", image: { link: "https://api.ycloud.com/v2/whatsapp/media/download/1?sig=x", caption: "Esta" } },
    });
    const m = r.messages[0]!;
    assert.equal(m.type, "image");
    assert.equal(m.text, "Esta");
    archivos.push(m.mediaUrl!.replace("/api/archivos/", ""));
    assert.equal((llamadas[0]!.init.headers as Record<string, string>)["X-API-Key"], CLAVE);
    // Un enlace que no es de YCloud no se pide con la clave: queda como no compatible.
    const otro = await interpretarEventoYCloud({ type: "whatsapp.inbound_message.received", whatsappInboundMessage: { wamid: "wamid.IMG2", from: CLIENTE, to: NEGOCIO, type: "image", image: { link: "https://otro.com/x.png" } } });
    assert.equal(otro.messages[0]!.type, "unsupported");
  });

  test("estados: se avisan por el wamid y por el id de YCloud", async () => {
    const r = await interpretarEventoYCloud({ type: "whatsapp.message.updated", whatsappMessage: { id: "yc9", wamid: "wamid.9", status: "delivered", sendTime: "2026-11-11T18:00:00.000Z" } });
    assert.deepEqual(r.statuses.map((s) => [s.externalMessageId, s.status]), [["wamid.9", "entregado"], ["yc9", "entregado"]]);
    const fallo = await interpretarEventoYCloud({ type: "whatsapp.message.updated", whatsappMessage: { id: "yc8", status: "failed" } });
    assert.deepEqual(fallo.statuses.map((s) => s.status), ["fallo"]);
  });

  test("eco: lo que el equipo escribió desde la app del celular, con el cliente en «to»", async () => {
    for (const type of ["whatsapp.smb.message.echoes", "whatsapp.smb.message.created"]) {
      const r = await interpretarEventoYCloud({ type, whatsappMessage: { wamid: "wamid.E", from: NEGOCIO, to: CLIENTE, type: "text", text: { body: "Ya va en camino" }, sendTime: "2026-11-11T19:00:00.000Z" } });
      assert.deepEqual(r.ecos.map((m) => [m.direccion, m.externalContactId, m.text]), [["saliente", CLIENTE, "Ya va en camino"]], type);
      assert.equal(r.messages.length, 0);
    }
  });

  test("historial: mensajes de las dos direcciones, sin descargar fotos; el aviso de avance solo no trae nada", async () => {
    simular(() => {
      throw new Error("el historial no debe descargar fotos");
    });
    const de = await interpretarEventoYCloud({ type: "whatsapp.smb.history", phase: 1, progress: 40, whatsappInboundMessage: { wamid: "wamid.H1", from: CLIENTE, to: NEGOCIO, type: "text", text: { body: "¿Tienen sillas?" }, sendTime: "2026-06-01T15:00:00.000Z", customerProfile: { name: "Ana" } } });
    const a = await interpretarEventoYCloud({ type: "whatsapp.smb.history", whatsappMessage: { wamid: "wamid.H2", from: NEGOCIO, to: CLIENTE, type: "image", image: { link: "https://api.ycloud.com/x", caption: "Esta" }, sendTime: "2026-06-01T15:05:00.000Z" } });
    assert.deepEqual([de.historial[0]!.direccion, de.historial[0]!.text, de.historial[0]!.contactName], ["entrante", "¿Tienen sillas?", "Ana"]);
    assert.deepEqual([a.historial[0]!.direccion, a.historial[0]!.type, a.historial[0]!.text], ["saliente", "unsupported", "Esta"]);
    assert.equal(llamadas.length, 0);
    const avance = await interpretarEventoYCloud({ type: "whatsapp.smb.history", phase: 1, progress: 73 });
    assert.equal(avance.historial.length + avance.messages.length + avance.ecos.length, 0);
  });
});

describe("YCloud: enviar", () => {
  test("texto: a sendDirectly, desde el número del negocio, con la clave; devuelve el wamid", async () => {
    simular(() => json({ id: "yc-msg", wamid: "wamid.salida", status: "accepted" }));
    const r = await adaptadorYCloud.send("50299996001", { type: "text", text: "Con gusto" });
    assert.deepEqual(r, { externalMessageId: "wamid.salida" });
    const [l] = llamadas;
    assert.equal(l!.url, "https://api.ycloud.com/v2/whatsapp/messages/sendDirectly");
    assert.equal((l!.init.headers as Record<string, string>)["X-API-Key"], CLAVE);
    assert.deepEqual(JSON.parse(String(l!.init.body)), { from: NEGOCIO, to: CLIENTE, type: "text", text: { body: "Con gusto", preview_url: false } });
  });

  test("sin wamid todavía, se guarda el id de YCloud", async () => {
    simular(() => json({ id: "yc-msg-2", status: "accepted" }));
    assert.deepEqual(await adaptadorYCloud.send(CLIENTE, { type: "text", text: "Hola" }), { externalMessageId: "yc-msg-2" });
  });

  test("imagen del sistema: se sube a YCloud y se manda por su id", async () => {
    const foto = await almacenamiento.guardar(PNG, "png");
    simular((u) => (u.includes("/upload") ? json({ id: "media-1" }) : json({ wamid: "wamid.foto" })));
    await adaptadorYCloud.send(CLIENTE, { type: "image", mediaUrl: foto.url });
    assert.equal(llamadas[0]!.url, `https://api.ycloud.com/v2/whatsapp/media/${encodeURIComponent(NEGOCIO)}/upload`);
    assert.deepEqual(JSON.parse(String(llamadas[1]!.init.body)).image, { id: "media-1" });
    await unlink(path.join(process.cwd(), "uploads", foto.url.replace("/api/archivos/", ""))).catch(() => {});
  });

  test("si falla, el error trae el código de Meta y nuestra explicación, nunca la clave ni el mensaje", async () => {
    simular(() => json({ error: { code: "WHATSAPP_ERROR", message: "Re-engagement texto privado", whatsappApiError: { code: 131047 } } }, 400));
    await assert.rejects(adaptadorYCloud.send(CLIENTE, { type: "text", text: "texto privado del cliente" }), (e: Error) => {
      assert.match(e.message, /YCloud respondió 400 \(código 131047\).*plantilla/);
      assert.ok(!e.message.includes(CLAVE) && !e.message.includes("privado"));
      return true;
    });
    simular(() => json({ error: { code: "PARAM_INVALID", message: "x" } }, 422));
    await assert.rejects(adaptadorYCloud.send(CLIENTE, { type: "text", text: "hola" }), /YCloud respondió 422 \(código PARAM_INVALID\)/);
  });

  test("plantillas: las aprobadas de YCloud, con el mismo filtro que las de Meta", async () => {
    simular(() =>
      json({
        items: [
          { name: "pedido_enviado", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Su pedido {{1}} va en camino" }] },
          { name: "con_foto", language: "es", status: "APPROVED", category: "MARKETING", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Oferta" }] },
        ],
      }),
    );
    const ps = await adaptadorYCloud.listTemplates!();
    assert.deepEqual(ps.map((p) => [p.nombre, p.variables]), [["pedido_enviado", 1]]);
    assert.match(llamadas[0]!.url, /whatsapp\/templates\?.*filter\.status=APPROVED/);
  });
});

describe("YCloud: guardar ecos e historial (con base de datos)", () => {
  const telefonos = ["+50299996101", "+50299996102"];
  const limpiar = async () => {
    const contactos = await db.contact.findMany({ where: { telefono: { in: telefonos } }, select: { id: true } });
    const ids = contactos.map((c) => c.id);
    if (!ids.length) return;
    await db.conversation.deleteMany({ where: { contactoId: { in: ids } } });
    await db.contact.deleteMany({ where: { id: { in: ids } } });
  };
  before(limpiar);
  after(async () => {
    await limpiar();
    await db.$disconnect();
  });
  const sinc = (o: { tel: string; id: string; direccion: "entrante" | "saliente"; fecha: string; texto: string; nombre?: string }) => ({
    channel: "whatsapp" as const, direccion: o.direccion, externalContactId: o.tel, contactName: o.nombre, externalMessageId: o.id, timestamp: new Date(o.fecha), type: "text" as const, text: o.texto,
  });

  test("historial: crea el contacto y una conversación cerrada con la fecha de su primer mensaje, sin no leídos", async () => {
    const tel = telefonos[0]!;
    await guardarSincronizado(sinc({ tel, id: "PRUEBA-YC-h2", direccion: "saliente", fecha: "2026-06-01T15:05:00Z", texto: "Sí, a Q450" }), "historial");
    await guardarSincronizado(sinc({ tel, id: "PRUEBA-YC-h1", direccion: "entrante", fecha: "2026-06-01T15:00:00Z", texto: "¿Tienen sillas?", nombre: "Ana Historial" }), "historial"); // llega desordenado
    assert.equal((await guardarSincronizado(sinc({ tel, id: "PRUEBA-YC-h1", direccion: "entrante", fecha: "2026-06-01T15:00:00Z", texto: "x" }), "historial")).duplicado, true);
    const c = await db.contact.findUniqueOrThrow({ where: { telefono: tel }, include: { conversaciones: { include: { mensajes: { orderBy: { fecha: "asc" } } } } } });
    const conv = c.conversaciones[0]!;
    assert.deepEqual([conv.estado, conv.noLeidos, conv.atendidaPor], ["cerrada", 0, "nadie"]);
    assert.equal(conv.creada.toISOString(), "2026-06-01T15:00:00.000Z"); // no cuenta como conversación nueva de hoy
    assert.equal(conv.lastMessageAt.toISOString(), "2026-06-01T15:05:00.000Z");
    assert.equal(conv.lastInboundAt?.toISOString(), "2026-06-01T15:00:00.000Z");
    assert.deepEqual(conv.mensajes.map((m) => [m.direccion, m.autor, m.texto, m.enviadoPorId]), [["entrante", "cliente", "¿Tienen sillas?", null], ["saliente", "asesor", "Sí, a Q450", null]]);
    // Cuando el cliente vuelve a escribir hoy, la misma conversación se reabre con todo su historial.
    const r = await recibirMensaje({ channel: "whatsapp", externalContactId: tel, externalMessageId: "PRUEBA-YC-nuevo", timestamp: new Date(), type: "text", text: "Hola de nuevo" });
    assert.equal(r.conversacionId, conv.id);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).estado, "abierta");
  });

  test("eco: queda como mensaje del equipo (sin persona), el asistente se aparta y la conversación se reabre", async () => {
    const tel = telefonos[1]!;
    await recibirMensaje({ channel: "whatsapp", externalContactId: tel, externalMessageId: "PRUEBA-YC-in", timestamp: new Date(Date.now() - 60_000), type: "text", text: "¿Ya salió mi pedido?" });
    const conv = await db.conversation.findFirstOrThrow({ where: { contacto: { telefono: tel } } });
    await db.conversation.update({ where: { id: conv.id }, data: { estado: "cerrada", atendidaPor: "asistente", esperandoAsesorDesde: new Date() } });
    const r = await guardarSincronizado(sinc({ tel, id: "PRUEBA-YC-eco", direccion: "saliente", fecha: new Date().toISOString(), texto: "Sí, va en camino" }), "eco");
    assert.equal(r.conversacionId, conv.id);
    const despues = await db.conversation.findUniqueOrThrow({ where: { id: conv.id }, include: { mensajes: { orderBy: { fecha: "asc" } } } });
    assert.deepEqual([despues.estado, despues.atendidaPor, despues.esperandoAsesorDesde], ["abierta", "asesor", null]);
    assert.deepEqual(despues.mensajes.map((m) => [m.direccion, m.autor, m.estado, m.enviadoPorId]), [["entrante", "cliente", null, null], ["saliente", "asesor", "enviado", null]]);
  });
});
