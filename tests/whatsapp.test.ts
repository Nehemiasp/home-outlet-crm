import "dotenv/config";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import { almacenamiento } from "@/lib/almacenamiento";
import { adaptadorWhatsApp, interpretarEntrada } from "@/lib/canales/whatsapp";
import { db } from "@/lib/db";

// Meta se simula cambiando fetch: no sale ninguna llamada a internet. El producto de prueba usa la base (npm run db).

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const ID_NUMERO = "1111222233";
const TOKEN = "token-de-prueba-secreto";

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
const cuerpoDe = (l: Llamada) => JSON.parse(String(l.init.body));
const entrada = (value: object, field = "messages") => ({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field, value: { metadata: { phone_number_id: ID_NUMERO }, ...value } }] }] });

describe("adaptador de WhatsApp (Meta simulado)", () => {
  const archivos: string[] = [];
  let productoId = "";
  const previo = { t: process.env.WHATSAPP_TOKEN, p: process.env.WHATSAPP_PHONE_NUMBER_ID };

  before(async () => {
    process.env.WHATSAPP_TOKEN = TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = ID_NUMERO;
    const foto = await almacenamiento.guardar(PNG, "png");
    archivos.push(foto.url.replace("/api/archivos/", ""));
    const p = await db.product.create({ data: { sku: "PRUEBA-WA-1", nombre: "Licuadora de prueba", precio: 34_900, imagenes: [foto.url] } });
    productoId = p.id;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });
  after(async () => {
    globalThis.fetch = fetchReal;
    previo.t === undefined ? delete process.env.WHATSAPP_TOKEN : (process.env.WHATSAPP_TOKEN = previo.t);
    previo.p === undefined ? delete process.env.WHATSAPP_PHONE_NUMBER_ID : (process.env.WHATSAPP_PHONE_NUMBER_ID = previo.p);
    await db.product.deleteMany({ where: { sku: "PRUEBA-WA-1" } });
    for (const n of archivos) await unlink(path.join(process.cwd(), "uploads", n)).catch(() => {});
    await db.$disconnect();
  });

  test("un texto entrante llega con teléfono en formato +502, nombre y hora", async () => {
    const r = await interpretarEntrada(entrada({ contacts: [{ wa_id: "50240432655", profile: { name: "Ana" } }], messages: [{ id: "wamid.1", from: "50240432655", timestamp: "1780000000", type: "text", text: { body: "Hola, ¿tienen licuadoras?" } }] }));
    assert.deepEqual(r.messages, [{ channel: "whatsapp", externalContactId: "+50240432655", contactName: "Ana", externalMessageId: "wamid.1", timestamp: new Date(1780000000_000), type: "text", text: "Hola, ¿tienen licuadoras?" }]);
    assert.deepEqual(r.statuses, []);
  });

  test("los estados de entrega se traducen y los desconocidos se ignoran", async () => {
    const r = await interpretarEntrada(entrada({ statuses: [{ id: "wamid.a", status: "sent", timestamp: "1780000001" }, { id: "wamid.a", status: "delivered", timestamp: "1780000002" }, { id: "wamid.a", status: "read", timestamp: "1780000003" }, { id: "wamid.b", status: "failed", timestamp: "1780000004" }, { id: "wamid.c", status: "deleted", timestamp: "1780000005" }] }));
    assert.deepEqual(r.statuses.map((s) => [s.externalMessageId, s.status]), [["wamid.a", "enviado"], ["wamid.a", "entregado"], ["wamid.a", "leido"], ["wamid.b", "fallo"]]);
  });

  test("lo que no se soporta llega como «unsupported»; lo de otro número o de otro campo se ignora", async () => {
    const m = { from: "50240432655", timestamp: "1780000000" };
    const r = await interpretarEntrada(entrada({ messages: [{ ...m, id: "wamid.s", type: "sticker" }, { ...m, id: "wamid.r", type: "reaction" }] }));
    assert.deepEqual(r.messages.map((x) => x.type), ["unsupported", "unsupported"]);
    const ajeno = { object: "x", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "999" }, messages: [{ ...m, id: "wamid.x", type: "text", text: { body: "hola" } }] } }] }] };
    assert.equal((await interpretarEntrada(ajeno)).messages.length, 0);
    assert.equal((await interpretarEntrada(entrada({ messages: [{ ...m, id: "wamid.y", type: "text", text: { body: "hola" } }] }, "account_update"))).messages.length, 0);
    assert.deepEqual(await interpretarEntrada({}), { messages: [], statuses: [] });
  });

  test("una imagen entrante se descarga con el token y se guarda; si falla, llega como «unsupported»", async () => {
    const msg = { id: "wamid.i", from: "50240432655", timestamp: "1780000000", type: "image", image: { id: "media-1", caption: "Quiero esta" } };
    simular((u) => (u.endsWith("/media-1") ? json({ url: "https://lookaside.example/archivo" }) : new Response(PNG)));
    const ok = (await interpretarEntrada(entrada({ messages: [msg] }))).messages[0]!;
    assert.equal(ok.type, "image");
    assert.equal(ok.text, "Quiero esta");
    assert.match(ok.mediaUrl!, /^\/api\/archivos\/[0-9a-f-]{36}\.png$/);
    archivos.push(ok.mediaUrl!.replace("/api/archivos/", ""));
    assert.ok(await almacenamiento.leer(archivos.at(-1)!), "el archivo quedó guardado");
    assert.ok(llamadas.every((l) => (l.init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`));

    simular(() => json({ error: { code: 100 } }, 400));
    const mal = (await interpretarEntrada(entrada({ messages: [msg] }))).messages[0]!;
    assert.deepEqual([mal.type, mal.mediaUrl], ["unsupported", undefined]);
  });

  test("enviar texto: va al número sin «+», con el token, y devuelve el id de Meta", async () => {
    simular(() => json({ messages: [{ id: "wamid.salida" }] }));
    const r = await adaptadorWhatsApp.send("+50240432655", { type: "text", text: "Con gusto, ¿en qué le ayudo?" });
    assert.deepEqual(r, { externalMessageId: "wamid.salida" });
    const [l] = llamadas;
    assert.equal(l!.url, `https://graph.facebook.com/v25.0/${ID_NUMERO}/messages`);
    assert.equal((l!.init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(cuerpoDe(l!), { messaging_product: "whatsapp", to: "50240432655", type: "text", text: { body: "Con gusto, ¿en qué le ayudo?", preview_url: false } });
  });

  test("si Meta rechaza el envío, falla sin mostrar el token ni el mensaje", async () => {
    simular(() => json({ error: { code: 131047, message: "Re-engagement message" } }, 400));
    await assert.rejects(adaptadorWhatsApp.send("+50240432655", { type: "text", text: "texto privado del cliente" }), (e: Error) => {
      assert.match(e.message, /400.*131047/);
      assert.ok(!e.message.includes(TOKEN) && !e.message.includes("texto privado"));
      return true;
    });
    simular(() => json({ ok: true }));
    await assert.rejects(adaptadorWhatsApp.send("+50240432655", { type: "text", text: "hola" }), /id del mensaje/);
  });

  test("la tarjeta de producto sube la foto y sale como imagen con nombre y precio, sin existencia", async () => {
    simular((u) => (u.endsWith("/media") ? json({ id: "medio-77" }) : json({ messages: [{ id: "wamid.prod" }] })));
    const r = await adaptadorWhatsApp.send("+50240432655", { type: "product", productId: productoId });
    assert.equal(r.externalMessageId, "wamid.prod");
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0]!.url, `https://graph.facebook.com/v25.0/${ID_NUMERO}/media`);
    const form = llamadas[0]!.init.body as FormData;
    assert.equal(form.get("messaging_product"), "whatsapp");
    assert.equal(form.get("type"), "image/png");
    const envio = cuerpoDe(llamadas[1]!);
    assert.equal(envio.type, "image");
    assert.equal(envio.image.id, "medio-77");
    assert.equal(envio.image.caption, "*Licuadora de prueba*\nQ349.00");
  });

  test("una imagen del sistema se sube y se manda por id; sin foto, el producto sale como texto", async () => {
    simular((u) => (u.endsWith("/media") ? json({ id: "medio-5" }) : json({ messages: [{ id: "wamid.img" }] })));
    await adaptadorWhatsApp.send("50240432655", { type: "image", mediaUrl: `/api/archivos/${archivos[0]}`, text: "Mire" });
    assert.deepEqual(cuerpoDe(llamadas[1]!).image, { id: "medio-5", caption: "Mire" });

    await db.product.update({ where: { id: productoId }, data: { imagenes: [] } });
    simular(() => json({ messages: [{ id: "wamid.txt" }] }));
    await adaptadorWhatsApp.send("50240432655", { type: "product", productId: productoId });
    assert.equal(llamadas.length, 1);
    assert.equal(cuerpoDe(llamadas[0]!).type, "text");
    assert.match(cuerpoDe(llamadas[0]!).text.body, /Licuadora de prueba/);
  });

  test("un PDF del sistema (la guía de envío) se sube y se manda como documento con su nombre; una imagen no sale como documento", async () => {
    const pdf = await almacenamiento.guardar(Buffer.from("%PDF-1.4\nguía\n"), "pdf");
    archivos.push(pdf.url.replace("/api/archivos/", ""));
    simular((u) => (u.endsWith("/media") ? json({ id: "medio-pdf" }) : json({ messages: [{ id: "wamid.doc" }] })));
    await adaptadorWhatsApp.send("50240432655", { type: "document", mediaUrl: pdf.url, filename: "Guía Forza.pdf" });
    const subida = llamadas[0]!.init.body as FormData;
    assert.equal(subida.get("type"), "application/pdf");
    assert.deepEqual(cuerpoDe(llamadas[1]!), { messaging_product: "whatsapp", to: "50240432655", type: "document", document: { id: "medio-pdf", filename: "Guía Forza.pdf" } });

    simular(() => json({ messages: [{ id: "wamid.x" }] }));
    await assert.rejects(adaptadorWhatsApp.send("50240432655", { type: "document", mediaUrl: `/api/archivos/${archivos[0]}`, filename: "foto.pdf" }));
    assert.equal(llamadas.length, 0);
  });

  test("un nombre de archivo que intenta salir de la carpeta no se sube", async () => {
    simular(() => json({ messages: [{ id: "wamid.z" }] }));
    await adaptadorWhatsApp.send("50240432655", { type: "image", mediaUrl: "/api/archivos/../../.env", text: "hola" });
    assert.equal(llamadas.length, 1, "no hubo subida");
    assert.equal(cuerpoDe(llamadas[0]!).type, "text");
  });
});
