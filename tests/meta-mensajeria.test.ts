import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import { almacenamiento } from "@/lib/almacenamiento";
import { adaptador, estadoCanales } from "@/lib/canales";
import { adaptadorFacebook, adaptadorInstagram, interpretarMeta, partirTexto } from "@/lib/canales/meta-mensajeria";
import { db } from "@/lib/db";

// Meta se simula cambiando fetch: no sale ninguna llamada a internet. Esto NO prueba contra Meta real (falta la cuenta):
// prueba que lo que enviamos y lo que entendemos sigue la documentación de la API de mensajería. El producto usa la base.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const ENV = {
  FACEBOOK_PAGE_TOKEN: "token-fb-secreto", FACEBOOK_PAGE_ID: "page-1", FACEBOOK_APP_SECRET: "secreto-fb", FACEBOOK_VERIFY_TOKEN: "verifica-fb",
  INSTAGRAM_TOKEN: "token-ig-secreto", INSTAGRAM_ACCOUNT_ID: "ig-1", INSTAGRAM_APP_SECRET: "secreto-ig", INSTAGRAM_VERIFY_TOKEN: "verifica-ig",
} as const;

type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[] = [];
const fetchReal = globalThis.fetch;
let contador = 0;
const simular = (responder: (u: string, init: RequestInit) => Response | Promise<Response>) => {
  llamadas = [];
  globalThis.fetch = (async (u: string | URL, init: RequestInit = {}) => {
    llamadas.push({ url: String(u), init });
    return responder(String(u), init);
  }) as typeof fetch;
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const cuerpoDe = (l: Llamada) => JSON.parse(String(l.init.body));
const enviosOk = (u: string) => (u.endsWith("me/message_attachments") ? json({ attachment_id: "adj-1" }) : json({ recipient_id: "x", message_id: `m.${++contador}` }));
const envia = (adp: typeof adaptadorFacebook, m: Parameters<typeof adaptadorFacebook.send>[1]) => adp.send("usuario-1", m);

const evento = (p: "page" | "instagram", id: string, messaging: object[]) => ({ object: p, entry: [{ id, time: 1, messaging }] });
const mensaje = (mid: string, resto: object, de = "cliente-1") => ({ sender: { id: de }, recipient: { id: "x" }, timestamp: 1780000000000, message: { mid, ...resto } });

describe("adaptadores de Facebook e Instagram (Meta simulado)", () => {
  const archivos: string[] = [];
  let productoId = "";
  let fotoUrl = "";
  const previo = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
  const canalesAntes = process.env.CHANNELS_ENABLED;

  before(async () => {
    Object.assign(process.env, ENV);
    const foto = await almacenamiento.guardar(PNG, "png");
    fotoUrl = foto.url;
    archivos.push(foto.url.replace("/api/archivos/", ""));
    productoId = (await db.product.create({ data: { sku: "PRUEBA-META-1", nombre: "Licuadora de prueba", precio: 34_900, imagenes: [foto.url] } })).id;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });
  after(async () => {
    globalThis.fetch = fetchReal;
    for (const [k, v] of Object.entries(previo)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    canalesAntes === undefined ? delete process.env.CHANNELS_ENABLED : (process.env.CHANNELS_ENABLED = canalesAntes);
    await db.product.deleteMany({ where: { sku: "PRUEBA-META-1" } });
    for (const n of archivos) await unlink(path.join(process.cwd(), "uploads", n)).catch(() => {});
    await db.$disconnect();
  });

  describe("partir textos largos", () => {
    const bytes = (s: string) => Buffer.byteLength(s, "utf8");
    test("un texto corto no se parte", () => assert.deepEqual(partirTexto("Hola", 950), ["Hola"]));

    test("corta por líneas, nunca pasa del límite en bytes (acentos y emojis pesan más) y no pierde nada", () => {
      const lineas = Array.from({ length: 60 }, (_, i) => `${i + 1} × Producto número ${i + 1} con ñ y 🧡   Q${i}.00`);
      const trozos = partirTexto(lineas.join("\n"), 300);
      assert.ok(trozos.length > 1);
      for (const t of trozos) assert.ok(bytes(t) <= 300, `${bytes(t)} bytes`);
      assert.equal(trozos.join("\n"), lineas.join("\n"), "cortar entre líneas deja el texto igual al unirlo");
    });

    test("una línea más larga que el límite se corta por palabras, y una palabra enorme por letras", () => {
      const palabras = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(" ");
      const t1 = partirTexto(palabras, 100);
      for (const t of t1) assert.ok(bytes(t) <= 100);
      assert.equal(t1.join(" "), palabras);
      const enorme = "x".repeat(450);
      const t2 = partirTexto(enorme, 100);
      for (const t of t2) assert.ok(bytes(t) <= 100);
      assert.equal(t2.join(""), enorme);
    });

    test("no devuelve trozos vacíos", () => assert.deepEqual(partirTexto("\n\n  \n", 100), []));
  });

  describe("envío", () => {
    test("un texto a Facebook: POST a /me/messages con el token de la página y messaging_type", async () => {
      simular(enviosOk);
      const r = await envia(adaptadorFacebook, { type: "text", text: "Hola" });
      assert.match(r.externalMessageId, /^m\./);
      assert.equal(llamadas.length, 1);
      assert.equal(llamadas[0]!.url, "https://graph.facebook.com/v25.0/me/messages");
      assert.equal((llamadas[0]!.init.headers as Record<string, string>).Authorization, "Bearer token-fb-secreto");
      assert.deepEqual(cuerpoDe(llamadas[0]!), { recipient: { id: "usuario-1" }, messaging_type: "RESPONSE", message: { text: "Hola" } });
    });

    test("un texto a Instagram usa su propio token y no manda messaging_type", async () => {
      simular(enviosOk);
      await envia(adaptadorInstagram, { type: "text", text: "Hola" });
      assert.equal((llamadas[0]!.init.headers as Record<string, string>).Authorization, "Bearer token-ig-secreto");
      assert.deepEqual(cuerpoDe(llamadas[0]!), { recipient: { id: "usuario-1" }, message: { text: "Hola" } });
    });

    test("un resumen largo sale en varios mensajes, en orden, y devuelve el id del último", async () => {
      simular(enviosOk);
      const largo = Array.from({ length: 40 }, (_, i) => `Línea ${i + 1} del resumen del pedido con algo de texto`).join("\n");
      const r = await envia(adaptadorInstagram, { type: "text", text: largo });
      assert.ok(llamadas.length > 1);
      const textos = llamadas.map((l) => cuerpoDe(l).message.text as string);
      assert.equal(textos.join("\n"), largo);
      for (const t of textos) assert.ok(Buffer.byteLength(t) <= 1000, "Instagram acepta 1000 bytes");
      assert.equal(r.externalMessageId, `m.${contador}`);
    });

    test("una imagen del sistema se sube a Facebook y se manda por id del adjunto", async () => {
      simular(enviosOk);
      await envia(adaptadorFacebook, { type: "image", mediaUrl: fotoUrl });
      assert.equal(llamadas[0]!.url, "https://graph.facebook.com/v25.0/me/message_attachments");
      const form = llamadas[0]!.init.body as FormData;
      assert.deepEqual(JSON.parse(String(form.get("message"))), { attachment: { type: "image", payload: { is_reusable: true } } });
      assert.ok(form.get("filedata") instanceof Blob);
      assert.deepEqual(cuerpoDe(llamadas[1]!).message, { attachment: { type: "image", payload: { attachment_id: "adj-1" } } });
    });

    test("una imagen con dirección pública (https) va por url en los dos canales, sin subirla", async () => {
      for (const adp of [adaptadorFacebook, adaptadorInstagram]) {
        simular(enviosOk);
        await envia(adp, { type: "image", mediaUrl: "https://cdn.ejemplo.com/foto.jpg" });
        assert.equal(llamadas.length, 1);
        assert.deepEqual(cuerpoDe(llamadas[0]!).message, { attachment: { type: "image", payload: { url: "https://cdn.ejemplo.com/foto.jpg", is_reusable: false } } });
      }
    });

    test("Instagram no recibe archivos subidos: una imagen del sistema con texto sale solo como texto", async () => {
      simular(enviosOk);
      await envia(adaptadorInstagram, { type: "image", mediaUrl: fotoUrl, text: "Mire este producto" });
      assert.equal(llamadas.length, 1);
      assert.deepEqual(cuerpoDe(llamadas[0]!).message, { text: "Mire este producto" });
    });

    test("una tarjeta de producto manda la foto y luego el texto con nombre, precio y existencia, sin asteriscos", async () => {
      simular(enviosOk);
      await envia(adaptadorFacebook, { type: "product", productId: productoId });
      const mensajes = llamadas.filter((l) => l.url.endsWith("me/messages")).map((l) => cuerpoDe(l).message);
      assert.equal(mensajes.length, 2);
      assert.ok(mensajes[0].attachment);
      assert.match(mensajes[1].text, /Licuadora de prueba\nQ349\.00\n/);
      assert.equal(mensajes[1].text.includes("*"), false);
    });

    test("no hay plantillas, ni se envía nada vacío", async () => {
      simular(enviosOk);
      await assert.rejects(envia(adaptadorFacebook, { type: "template", template: { nombre: "x", idioma: "es", parametros: [] } }), /no tiene plantillas/);
      await assert.rejects(envia(adaptadorInstagram, { type: "text", text: "" }), /nada que enviar/);
      assert.equal(llamadas.length, 0);
    });

    test("si Meta rechaza el envío, el error trae el código y nunca el token ni el mensaje", async () => {
      simular(() => json({ error: { code: 551, message: "Esta persona no está disponible" } }, 400));
      const e = await envia(adaptadorInstagram, { type: "text", text: "Texto privado del cliente" }).catch((x: Error) => x);
      assert.ok(e instanceof Error);
      assert.match(e.message, /Instagram respondió 400 \(código 551\)/);
      assert.equal(e.message.includes("token-ig-secreto") || e.message.includes("privado"), false);
    });

    test("si Meta no devuelve el id del mensaje, falla en vez de inventar uno", async () => {
      simular(() => json({ recipient_id: "x" }));
      await assert.rejects(envia(adaptadorFacebook, { type: "text", text: "Hola" }), /no devolvió el id/);
    });
  });

  describe("entrada", () => {
    test("un texto de Facebook llega con el id del usuario, su nombre y la hora", async () => {
      simular((u) => (u.includes("/cliente-1?") ? json({ name: "Ana Pérez" }) : json({}, 404)));
      const r = await interpretarMeta("facebook", evento("page", "page-1", [mensaje("mid.1", { text: "Hola, ¿tienen licuadoras?" })]));
      assert.deepEqual(r.messages, [{ channel: "facebook", externalContactId: "cliente-1", contactName: "Ana Pérez", externalMessageId: "mid.1", timestamp: new Date(1780000000000), type: "text", text: "Hola, ¿tienen licuadoras?" }]);
      assert.equal(llamadas[0]!.url, "https://graph.facebook.com/v25.0/cliente-1?fields=name");
    });

    test("en Instagram pide también el usuario y usa @usuario si no hay nombre; si el perfil falla, queda sin nombre", async () => {
      simular(() => json({ username: "ana_gt" }));
      const a = await interpretarMeta("instagram", evento("instagram", "ig-1", [mensaje("mid.2", { text: "Hola" }, "ig-cliente-A")]));
      assert.equal(a.messages[0]!.contactName, "ana_gt");
      assert.match(llamadas[0]!.url, /fields=name,username/);
      simular(() => json({ error: { code: 190 } }, 400));
      const b = await interpretarMeta("instagram", evento("instagram", "ig-1", [mensaje("mid.3", { text: "Hola" }, "ig-cliente-B")]));
      assert.equal(b.messages[0]!.contactName, undefined);
      assert.equal(b.messages[0]!.type, "text");
    });

    test("el nombre del perfil se recuerda: el segundo mensaje no vuelve a preguntar", async () => {
      simular(() => json({ name: "Luis" }));
      await interpretarMeta("facebook", evento("page", "page-1", [mensaje("mid.4", { text: "a" }, "cliente-memo")]));
      await interpretarMeta("facebook", evento("page", "page-1", [mensaje("mid.5", { text: "b" }, "cliente-memo")]));
      assert.equal(llamadas.length, 1);
    });

    test("los ecos (lo que mandamos nosotros), lo de otra página y lo de otro tipo de objeto se ignoran", async () => {
      simular(() => json({ name: "X" }));
      const eco = mensaje("mid.e", { text: "hola", is_echo: true });
      const propio = mensaje("mid.p", { text: "hola" }, "page-1");
      assert.equal((await interpretarMeta("facebook", evento("page", "page-1", [eco, propio]))).messages.length, 0);
      assert.equal((await interpretarMeta("facebook", evento("page", "otra-pagina", [mensaje("mid.o", { text: "hola" })]))).messages.length, 0);
      assert.equal((await interpretarMeta("facebook", evento("instagram", "page-1", [mensaje("mid.i", { text: "hola" })]))).messages.length, 0);
      assert.deepEqual(await interpretarMeta("instagram", {}), { messages: [], statuses: [] });
    });

    test("una imagen entrante se descarga y se guarda; si no se puede descargar llega como «unsupported»", async () => {
      simular((u) => (u.startsWith("https://cdn.meta/") ? new Response(new Uint8Array(PNG), { status: 200 }) : json({ name: "Ana" })));
      const ok = await interpretarMeta("instagram", evento("instagram", "ig-1", [mensaje("mid.img", { text: "mi comprobante", attachments: [{ type: "image", payload: { url: "https://cdn.meta/foto.png" } }] }, "ig-cliente-C")]));
      assert.equal(ok.messages[0]!.type, "image");
      assert.equal(ok.messages[0]!.text, "mi comprobante");
      assert.match(ok.messages[0]!.mediaUrl!, /^\/api\/archivos\/.+\.png$/);
      archivos.push(ok.messages[0]!.mediaUrl!.replace("/api/archivos/", ""));

      simular((u) => (u.startsWith("https://cdn.meta/") ? new Response("no", { status: 403 }) : json({ name: "Ana" })));
      const mal = await interpretarMeta("instagram", evento("instagram", "ig-1", [mensaje("mid.img2", { attachments: [{ type: "image", payload: { url: "https://cdn.meta/vencida.png" } }] }, "ig-cliente-C")]));
      assert.equal(mal.messages[0]!.type, "unsupported");

      simular((u) => (u.startsWith("https://cdn.meta/") ? new Response("<html>no soy una imagen</html>") : json({ name: "Ana" })));
      const falsa = await interpretarMeta("instagram", evento("instagram", "ig-1", [mensaje("mid.img3", { attachments: [{ type: "image", payload: { url: "https://cdn.meta/falsa.png" } }] }, "ig-cliente-C")]));
      assert.equal(falsa.messages[0]!.type, "unsupported", "algo que no es una imagen no se guarda");
    });

    test("varias imágenes en un mensaje no repiten el id (se evitan duplicados)", async () => {
      simular((u) => (u.startsWith("https://cdn.meta/") ? new Response(new Uint8Array(PNG)) : json({ name: "Ana" })));
      const a = (n: number) => ({ type: "image", payload: { url: `https://cdn.meta/${n}.png` } });
      const r = await interpretarMeta("facebook", evento("page", "page-1", [mensaje("mid.varias", { attachments: [a(1), a(2)] }, "cliente-D")]));
      assert.deepEqual(r.messages.map((m) => m.externalMessageId), ["mid.varias", "mid.varias:2"]);
      for (const m of r.messages) if (m.mediaUrl) archivos.push(m.mediaUrl.replace("/api/archivos/", ""));
    });

    test("audio, archivos, historias y mensajes vacíos llegan como «unsupported»", async () => {
      simular(() => json({ name: "Ana" }));
      const r = await interpretarMeta("facebook", evento("page", "page-1", [mensaje("mid.a", { attachments: [{ type: "audio", payload: { url: "https://x" } }] }, "cliente-E"), mensaje("mid.b", {}, "cliente-E")]));
      assert.deepEqual(r.messages.map((m) => m.type), ["unsupported", "unsupported"]);
    });

    test("estados: Facebook avisa «entregado» por mensaje e Instagram «leído» por mensaje; lo demás se ignora", async () => {
      const fb = await interpretarMeta("facebook", evento("page", "page-1", [{ sender: { id: "c" }, timestamp: 5, delivery: { mids: ["m.1", "m.2"], watermark: 5 } }, { sender: { id: "c" }, timestamp: 6, read: { watermark: 6 } }]));
      assert.deepEqual(fb.statuses.map((s) => [s.externalMessageId, s.status]), [["m.1", "entregado"], ["m.2", "entregado"]]);
      assert.equal(fb.messages.length, 0);
      const ig = await interpretarMeta("instagram", evento("instagram", "ig-1", [{ sender: { id: "c" }, timestamp: 7, read: { mid: "m.9" } }]));
      assert.deepEqual(ig.statuses.map((s) => [s.externalMessageId, s.status]), [["m.9", "leido"]]);
    });
  });

  describe("seguridad del webhook y registro del canal", () => {
    const firmar = (cuerpo: string, secreto: string) => `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
    const pedir = (cuerpo: string, cabecera: string | null) => new Request("http://x/api/webhooks/facebook", { method: "POST", body: cuerpo, headers: cabecera ? { "x-hub-signature-256": cabecera } : {} });

    test("la firma se valida con el secreto de cada canal: la de uno no sirve para el otro", async () => {
      const c = JSON.stringify({ a: 1 });
      assert.equal(await adaptadorFacebook.verifyWebhook(pedir(c, firmar(c, "secreto-fb"))), true);
      assert.equal(await adaptadorFacebook.verifyWebhook(pedir(c, firmar(c, "secreto-ig"))), false);
      assert.equal(await adaptadorInstagram.verifyWebhook(pedir(c, firmar(c, "secreto-ig"))), true);
      assert.equal(await adaptadorInstagram.verifyWebhook(pedir(c, firmar("otro", "secreto-ig"))), false);
      assert.equal(await adaptadorInstagram.verifyWebhook(pedir(c, null)), false);
    });

    test("sin secreto configurado nada se acepta", async () => {
      const antes = process.env.FACEBOOK_APP_SECRET;
      delete process.env.FACEBOOK_APP_SECRET;
      const c = "{}";
      assert.equal(await adaptadorFacebook.verifyWebhook(pedir(c, firmar(c, ""))), false);
      process.env.FACEBOOK_APP_SECRET = antes;
    });

    test("el GET de suscripción devuelve el reto solo con el token de ese canal", () => {
      const url = (t: string) => new URL(`http://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=12345`);
      assert.equal(adaptadorInstagram.verifySubscription!(url("verifica-ig")), "12345");
      assert.equal(adaptadorInstagram.verifySubscription!(url("verifica-fb")), null);
      assert.equal(adaptadorFacebook.verifySubscription!(url("verifica-fb")), "12345");
      assert.equal(adaptadorFacebook.verifySubscription!(new URL("http://x/?hub.mode=otro&hub.verify_token=verifica-fb&hub.challenge=1")), null);
    });

    test("el canal solo está activo si se habilitó y tiene todas sus variables; si no, dice cuáles faltan", () => {
      process.env.CHANNELS_ENABLED = "simulado,facebook,instagram";
      assert.ok(adaptador("facebook") && adaptador("instagram"));
      const sinToken = process.env.INSTAGRAM_TOKEN;
      delete process.env.INSTAGRAM_TOKEN;
      assert.equal(adaptador("instagram"), null);
      assert.deepEqual(estadoCanales().find((c) => c.canal === "instagram")!.faltantes, ["INSTAGRAM_TOKEN"]);
      process.env.INSTAGRAM_TOKEN = sinToken;
      process.env.CHANNELS_ENABLED = "simulado";
      assert.equal(adaptador("facebook"), null, "sin habilitarlo en CHANNELS_ENABLED no hay adaptador");
    });

    test("el canal de TikTok sigue sin adaptador", () => {
      process.env.CHANNELS_ENABLED = "simulado,tiktok";
      assert.equal(adaptador("tiktok"), null);
      process.env.CHANNELS_ENABLED = "simulado";
    });
  });
});
