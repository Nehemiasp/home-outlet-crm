import "dotenv/config";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { after, afterEach, before, describe, test } from "node:test";
import { almacenamiento } from "@/lib/almacenamiento";
import { adaptador, estadoCanales } from "@/lib/canales";
import { adaptadorTikTok, contarMensajesTikTok, firmarTikTok, firmaTikTokValida, interpretarTikTok } from "@/lib/canales/tiktok";
import { apiSimulada, entradaSimulada } from "@/lib/canales/tiktok-simulado";
import { horasVentana, msRestantes, sinPlantillas, textoBloqueoVentana, textoVentanaCerrada, ventanaAbierta } from "@/lib/canales/ventana";
import { db } from "@/lib/db";
import { enviarMensaje, recibirMensaje, reintentarMensaje, salientesRestantes } from "@/lib/mensajeria";
import { puedeEnviarPorCanal } from "@/lib/pedidos/pedidos";

// TikTok se simula cambiando fetch: no sale ninguna llamada a internet. Esto NO prueba contra TikTok real (falta la aprobación):
// prueba que lo que enviamos y lo que entendemos es coherente con la forma supuesta de la API, y que la API simulada aplica las
// mismas reglas que TikTok (48 horas, 10 mensajes seguidos).

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const ENV = { TIKTOK_ACCESS_TOKEN: "token-tt-secreto", TIKTOK_BUSINESS_ID: "negocio-tt", TIKTOK_APP_SECRET: "secreto-tt" } as const;
const RUTA = "https://business-api.tiktok.com/open_api/v1.3";
const P = "PRUEBA-TT";

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
const enviosOk = (u: string) => (u.endsWith("upload/") ? json({ code: 0, message: "OK", data: { media_id: "med-1" } }) : json({ code: 0, message: "OK", data: { message_id: `tt.${++contador}` } }));
const aviso = (event: string, contenido: object, extra: object = {}) => ({ event, business_id: "negocio-tt", timestamp: 1780000000, content: JSON.stringify(contenido), ...extra });
const recibe = (id: string, resto: object, de = "cliente-1") => aviso("im_receive_msg", { message_id: id, from_user: { id: de, display_name: "Ana Pérez" }, ...resto });

describe("adaptador de TikTok (TikTok simulado)", () => {
  const archivos: string[] = [];
  let productoId = "";
  let fotoUrl = "";
  const previo = Object.fromEntries([...Object.keys(ENV), "TIKTOK_API_URL", "CHANNELS_ENABLED"].map((k) => [k, process.env[k]]));

  before(async () => {
    Object.assign(process.env, ENV);
    delete process.env.TIKTOK_API_URL;
    process.env.CHANNELS_ENABLED = "simulado,tiktok";
    const foto = await almacenamiento.guardar(PNG, "png");
    fotoUrl = foto.url;
    archivos.push(foto.url.replace("/api/archivos/", ""));
    productoId = (await db.product.create({ data: { sku: "PRUEBA-TT-1", nombre: "Licuadora de prueba", precio: 34_900, imagenes: [foto.url] } })).id;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });
  after(async () => {
    globalThis.fetch = fetchReal;
    for (const [k, v] of Object.entries(previo)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    await db.product.deleteMany({ where: { sku: "PRUEBA-TT-1" } });
    await db.contact.deleteMany({ where: { nombre: { startsWith: P } } });
    for (const n of archivos) await unlink(path.join(process.cwd(), "uploads", n)).catch(() => {});
    await db.$disconnect();
  });

  describe("ventana de 48 horas", () => {
    const ahora = new Date("2026-10-30T12:00:00Z");
    const haceH = (h: number) => new Date(ahora.getTime() - h * 3600_000);
    test("TikTok da 48 horas; los demás canales, 24", () => {
      assert.equal(horasVentana("tiktok"), 48);
      for (const c of ["whatsapp", "facebook", "instagram", "simulado"] as const) assert.equal(horasVentana(c), 24, c);
      assert.equal(horasVentana(), 24);
    });
    test("a las 30 horas sigue abierta en TikTok y cerrada en WhatsApp; a las 48 se cierra", () => {
      assert.equal(ventanaAbierta(haceH(30), ahora, "tiktok"), true);
      assert.equal(ventanaAbierta(haceH(30), ahora, "whatsapp"), false);
      assert.equal(msRestantes(haceH(48), ahora, "tiktok"), 0);
      assert.equal(ventanaAbierta(null, ahora, "tiktok"), false);
    });
    test("el adaptador usa su propia ventana", () => {
      assert.equal(adaptadorTikTok.canSendFreeForm({ lastInboundAt: new Date() }), true);
      assert.equal(adaptadorTikTok.canSendFreeForm({ lastInboundAt: new Date(Date.now() - 47 * 3600_000) }), true);
      assert.equal(adaptadorTikTok.canSendFreeForm({ lastInboundAt: new Date(Date.now() - 49 * 3600_000) }), false);
      assert.equal(adaptadorTikTok.canSendFreeForm({ lastInboundAt: null }), false);
    });
    test("los textos dicen las horas del canal y no ofrecen plantillas donde no las hay", () => {
      assert.match(textoVentanaCerrada("tiktok"), /48 horas.*vuelva a escribir/);
      assert.match(textoVentanaCerrada("whatsapp"), /24 horas.*plantillas aprobadas/);
      assert.match(textoBloqueoVentana("tiktok"), /48 horas.*notas internas/);
      assert.equal(sinPlantillas("tiktok") && sinPlantillas("facebook") && sinPlantillas("instagram"), true);
      assert.equal(sinPlantillas("whatsapp") || sinPlantillas("simulado"), false);
    });
  });

  describe("envío", () => {
    test("un texto: POST a la ruta de envío con el Access-Token y el negocio", async () => {
      simular(enviosOk);
      const r = await adaptadorTikTok.send("usuario-1", { type: "text", text: "Hola" });
      assert.match(r.externalMessageId, /^tt\./);
      assert.equal(llamadas.length, 1);
      assert.equal(llamadas[0]!.url, `${RUTA}/business/message/send/`);
      assert.equal((llamadas[0]!.init.headers as Record<string, string>)["Access-Token"], "token-tt-secreto");
      assert.deepEqual(cuerpoDe(llamadas[0]!), { business_id: "negocio-tt", recipient_type: "USER", recipient: "usuario-1", message_type: "TEXT", text: { body: "Hola" } });
    });

    test("TIKTOK_API_URL cambia la dirección base (la API simulada) y se ignora la barra final", async () => {
      process.env.TIKTOK_API_URL = "http://localhost:3000/api/simulador/tiktok/";
      try {
        simular(enviosOk);
        await adaptadorTikTok.send("usuario-1", { type: "text", text: "Hola" });
        assert.equal(llamadas[0]!.url, "http://localhost:3000/api/simulador/tiktok/business/message/send/");
      } finally {
        delete process.env.TIKTOK_API_URL;
      }
    });

    test("un resumen largo sale en varios mensajes, en orden, y devuelve el id del último", async () => {
      simular(enviosOk);
      const largo = Array.from({ length: 60 }, (_, i) => `Línea ${i + 1} del resumen del pedido con algo de texto`).join("\n");
      const r = await adaptadorTikTok.send("usuario-1", { type: "text", text: largo });
      assert.ok(llamadas.length > 1);
      const textos = llamadas.map((l) => cuerpoDe(l).text.body as string);
      assert.equal(textos.join("\n"), largo);
      for (const t of textos) assert.ok(Buffer.byteLength(t) <= 1000);
      assert.equal(r.externalMessageId, `tt.${contador}`);
    });

    test("una imagen del sistema se sube y se manda por el id del medio", async () => {
      simular(enviosOk);
      await adaptadorTikTok.send("usuario-1", { type: "image", mediaUrl: fotoUrl });
      assert.equal(llamadas[0]!.url, `${RUTA}/business/message/media/upload/`);
      const form = llamadas[0]!.init.body as FormData;
      assert.deepEqual([form.get("business_id"), form.get("media_type")], ["negocio-tt", "IMAGE"]);
      assert.ok(form.get("file") instanceof Blob);
      assert.deepEqual(cuerpoDe(llamadas[1]!), { business_id: "negocio-tt", recipient_type: "USER", recipient: "usuario-1", message_type: "IMAGE", image: { media_id: "med-1" } });
    });

    test("una tarjeta de producto manda la foto y luego el texto con nombre, precio y existencia, sin asteriscos", async () => {
      simular(enviosOk);
      await adaptadorTikTok.send("usuario-1", { type: "product", productId: productoId });
      const envios = llamadas.filter((l) => l.url.endsWith("send/")).map(cuerpoDe);
      assert.equal(envios.length, 2);
      assert.equal(envios[0].message_type, "IMAGE");
      assert.match(envios[1].text.body, /Licuadora de prueba\nQ349\.00\n/);
      assert.equal(envios[1].text.body.includes("*"), false);
    });

    test("una imagen que no se puede subir sale solo como texto; sin texto ni imagen no se envía nada", async () => {
      simular(enviosOk);
      await adaptadorTikTok.send("usuario-1", { type: "image", mediaUrl: "/api/archivos/no-existe.png", text: "Mire este producto" });
      assert.equal(llamadas.length, 1);
      assert.equal(cuerpoDe(llamadas[0]!).text.body, "Mire este producto");
      await assert.rejects(adaptadorTikTok.send("usuario-1", { type: "text", text: "" }), /nada que enviar/);
    });

    test("no hay plantillas", async () => {
      simular(enviosOk);
      await assert.rejects(adaptadorTikTok.send("usuario-1", { type: "template", template: { nombre: "x", idioma: "es", parametros: [] } }), /no tiene plantillas/);
      assert.equal(llamadas.length, 0);
    });

    test("si TikTok rechaza el envío, el error trae el código y nunca el token ni el mensaje (también con HTTP 200 y código distinto de 0)", async () => {
      simular(() => json({ code: 40011, message: "Texto privado del cliente" }, 400));
      const e = await adaptadorTikTok.send("usuario-1", { type: "text", text: "Texto privado del cliente" }).catch((x: Error) => x);
      assert.ok(e instanceof Error);
      assert.match(e.message, /TikTok respondió 400 \(código 40011\)/);
      assert.equal(e.message.includes("token-tt-secreto") || e.message.includes("privado"), false);
      simular(() => json({ code: 40105, message: "x" }));
      await assert.rejects(adaptadorTikTok.send("usuario-1", { type: "text", text: "Hola" }), /código 40105/);
    });

    test("si TikTok no devuelve el id del mensaje, falla en vez de inventar uno", async () => {
      simular(() => json({ code: 0, message: "OK", data: {} }));
      await assert.rejects(adaptadorTikTok.send("usuario-1", { type: "text", text: "Hola" }), /no devolvió el id/);
    });
  });

  describe("entrada", () => {
    test("un texto llega con el id del usuario, su nombre y la hora", async () => {
      const r = await interpretarTikTok(recibe("m-1", { message_type: "text", text: { body: "Hola, ¿tienen licuadoras?" } }));
      assert.deepEqual(r.messages, [{ channel: "tiktok", externalContactId: "cliente-1", contactName: "Ana Pérez", externalMessageId: "m-1", timestamp: new Date(1780000000_000), type: "text", text: "Hola, ¿tienen licuadoras?" }]);
      assert.deepEqual(r.statuses, []);
    });

    test("el contenido también se acepta como objeto, no solo como texto JSON", async () => {
      const r = await interpretarTikTok({ event: "im_receive_msg", business_id: "negocio-tt", timestamp: 1780000000, content: { message_id: "m-2", message_type: "text", text: { body: "Hola" }, from_user: { id: "c2" } } });
      assert.deepEqual(r.messages.map((m) => [m.externalContactId, m.contactName, m.text]), [["c2", undefined, "Hola"]]);
    });

    test("una imagen entrante se descarga y se guarda; si no se puede descargar o no es imagen, llega como «unsupported»", async () => {
      simular((u) => (u.startsWith("https://cdn.tt/") ? new Response(new Uint8Array(PNG), { status: 200 }) : json({}, 404)));
      const ok = await interpretarTikTok(recibe("m-img", { message_type: "image", image: { url: "https://cdn.tt/foto.png" } }, "cliente-img"));
      assert.equal(ok.messages[0]!.type, "image");
      assert.match(ok.messages[0]!.mediaUrl!, /^\/api\/archivos\/.+\.png$/);
      archivos.push(ok.messages[0]!.mediaUrl!.replace("/api/archivos/", ""));

      simular(() => new Response("no", { status: 403 }));
      assert.equal((await interpretarTikTok(recibe("m-img2", { message_type: "image", image: { url: "https://cdn.tt/vencida.png" } }))).messages[0]!.type, "unsupported");
      simular(() => new Response("<html>no soy una imagen</html>"));
      assert.equal((await interpretarTikTok(recibe("m-img3", { message_type: "image", image: { url: "https://cdn.tt/falsa.png" } }))).messages[0]!.type, "unsupported");
    });

    test("video, voz y mensajes vacíos llegan como «unsupported»", async () => {
      const r = await interpretarTikTok({ event: "im_receive_msg", business_id: "negocio-tt", timestamp: 1780000000, content: JSON.stringify({ message_id: "m-v", message_type: "video", from_user: { id: "c" } }) });
      assert.deepEqual(r.messages.map((m) => m.type), ["unsupported"]);
      assert.equal((await interpretarTikTok(recibe("m-t", { message_type: "text", text: {} }))).messages[0]!.type, "unsupported");
    });

    test("lo de otra cuenta, los ecos (lo que mandamos nosotros), los eventos desconocidos y el contenido roto se ignoran", async () => {
      const vacio = { messages: [], statuses: [] };
      assert.deepEqual(await interpretarTikTok({ ...recibe("x", { message_type: "text", text: { body: "hola" } }), business_id: "otra-cuenta" }), vacio);
      assert.deepEqual(await interpretarTikTok(aviso("im_send_msg", { message_id: "eco", message_type: "text", text: { body: "hola" }, from_user: { id: "negocio-tt" } })), vacio);
      assert.deepEqual(await interpretarTikTok(recibe("propio", { message_type: "text", text: { body: "hola" } }, "negocio-tt")), vacio);
      assert.deepEqual(await interpretarTikTok(aviso("im_otra_cosa", { message_id: "x" })), vacio);
      assert.deepEqual(await interpretarTikTok({ event: "im_receive_msg", business_id: "negocio-tt", content: "{no es json" }), vacio);
      assert.deepEqual(await interpretarTikTok(null), vacio);
      assert.deepEqual(await interpretarTikTok({}), vacio);
    });

    test("cuando el cliente lee un mensaje nuestro llega el estado «leído»; TikTok no avisa «entregado»", async () => {
      const r = await interpretarTikTok(aviso("im_mark_read_msg", { target_message_id: "tt.9" }));
      assert.deepEqual(r.statuses.map((s) => [s.externalMessageId, s.status]), [["tt.9", "leido"]]);
      assert.equal(r.messages.length, 0);
    });
  });

  describe("seguridad del webhook y registro del canal", () => {
    const pedir = (cuerpo: string, cabecera: string | null) => new Request("http://x/api/webhooks/tiktok", { method: "POST", body: cuerpo, headers: cabecera ? { "tiktok-signature": cabecera } : {} });
    const c = JSON.stringify({ a: 1 });

    test("la firma se valida con el secreto, el cuerpo y la hora", async () => {
      assert.equal(await adaptadorTikTok.verifyWebhook(pedir(c, firmarTikTok(c, "secreto-tt"))), true);
      assert.equal(await adaptadorTikTok.verifyWebhook(pedir(c, firmarTikTok(c, "otro-secreto"))), false);
      assert.equal(await adaptadorTikTok.verifyWebhook(pedir(`${c} `, firmarTikTok(c, "secreto-tt"))), false, "un cuerpo cambiado no pasa");
      assert.equal(await adaptadorTikTok.verifyWebhook(pedir(c, null)), false);
      for (const mala of ["", "basura", "t=1,s=zz", "t=abc,s=00", "s=00"]) assert.equal(await adaptadorTikTok.verifyWebhook(pedir(c, mala)), false, mala);
    });

    test("un aviso con la firma de hace más de 5 minutos (o de más de 5 minutos en el futuro) se rechaza", () => {
      const ahora = Date.now();
      assert.equal(firmaTikTokValida(c, firmarTikTok(c, "s", ahora - 4 * 60_000), "s", ahora), true);
      assert.equal(firmaTikTokValida(c, firmarTikTok(c, "s", ahora - 6 * 60_000), "s", ahora), false);
      assert.equal(firmaTikTokValida(c, firmarTikTok(c, "s", ahora + 6 * 60_000), "s", ahora), false);
    });

    test("sin secreto configurado nada se acepta", async () => {
      delete process.env.TIKTOK_APP_SECRET;
      try {
        assert.equal(await adaptadorTikTok.verifyWebhook(pedir(c, firmarTikTok(c, ""))), false);
      } finally {
        process.env.TIKTOK_APP_SECRET = ENV.TIKTOK_APP_SECRET;
      }
    });

    test("el canal solo está activo si se habilitó y tiene sus tres variables; si no, dice cuáles faltan", () => {
      assert.ok(adaptador("tiktok"));
      assert.equal(estadoCanales().find((x) => x.canal === "tiktok")!.activo, true);
      const sinToken = process.env.TIKTOK_ACCESS_TOKEN;
      delete process.env.TIKTOK_ACCESS_TOKEN;
      assert.equal(adaptador("tiktok"), null);
      assert.deepEqual(estadoCanales().find((x) => x.canal === "tiktok")!.faltantes, ["TIKTOK_ACCESS_TOKEN"]);
      process.env.TIKTOK_ACCESS_TOKEN = sinToken;
      process.env.CHANNELS_ENABLED = "simulado";
      assert.equal(adaptador("tiktok"), null, "sin habilitarlo en CHANNELS_ENABLED no hay adaptador");
      process.env.CHANNELS_ENABLED = "simulado,tiktok";
    });
  });

  describe("la API de TikTok simulada aplica las reglas de TikTok", () => {
    const pedir = (ruta: string, cuerpo: object | FormData, token: string | null = "token-tt-secreto") =>
      apiSimulada(ruta, new Request(`http://localhost/${ruta}/`, { method: "POST", body: cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo), headers: { ...(token ? { "access-token": token } : {}), ...(cuerpo instanceof FormData ? {} : { "content-type": "application/json" }) } }));
    const texto = (recipient: string, body = "Hola") => ({ business_id: "negocio-tt", recipient_type: "USER", recipient, message_type: "TEXT", text: { body } });
    const codigo = async (r: Response) => ((await r.json()) as { code: number }).code;

    test("sin el Access-Token correcto responde 401; con datos incompletos, 400; una ruta desconocida, 404", async () => {
      assert.equal((await pedir("business/message/send", texto("u1"), null)).status, 401);
      assert.equal((await pedir("business/message/send", texto("u1"), "otro")).status, 401);
      assert.equal((await pedir("business/message/send", { ...texto("u1"), business_id: "otro" })).status, 400);
      assert.equal((await pedir("business/message/send", { ...texto("u1"), text: { body: "" } })).status, 400);
      assert.equal((await pedir("business/message/send", { business_id: "negocio-tt", recipient: "u1", message_type: "IMAGE", image: {} })).status, 400);
      assert.equal((await pedir("business/otra-cosa", {})).status, 404);
    });

    test("en producción no existe", async () => {
      const antes = process.env.NODE_ENV;
      (process.env as Record<string, string>).NODE_ENV = "production";
      try {
        assert.equal((await pedir("business/message/send", texto("u1"))).status, 404);
      } finally {
        (process.env as Record<string, string>).NODE_ENV = antes!;
      }
    });

    test("una imagen se sube y devuelve su id de medio; sin archivo, 400", async () => {
      const f = new FormData();
      f.set("business_id", "negocio-tt");
      f.set("media_type", "IMAGE");
      f.set("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "x.png");
      const r = await pedir("business/message/media/upload", f);
      assert.match(((await r.json()) as { data: { media_id: string } }).data.media_id, /^sim-media-/);
      const g = new FormData();
      g.set("business_id", "negocio-tt");
      g.set("media_type", "IMAGE");
      assert.equal((await pedir("business/message/media/upload", g)).status, 400);
    });

    test("hasta 10 mensajes seguidos; el 11.º se rechaza hasta que el cliente vuelve a escribir", async () => {
      await entradaSimulada({ usuarioId: "u-tope", texto: "Hola" });
      for (let i = 0; i < 10; i++) assert.equal(await codigo(await pedir("business/message/send", texto("u-tope", `m${i}`))), 0, `mensaje ${i + 1}`);
      const r = await pedir("business/message/send", texto("u-tope", "uno más"));
      assert.deepEqual([r.status, await codigo(r)], [400, 40011]);
      await entradaSimulada({ usuarioId: "u-tope", texto: "Sigo aquí" });
      assert.equal(await codigo(await pedir("business/message/send", texto("u-tope"))), 0, "el cuenta vuelve a cero");
    });

    test("pasadas las 48 horas del último mensaje del cliente se rechaza", async () => {
      await entradaSimulada({ usuarioId: "u-ventana", texto: "Hola" });
      assert.equal(await codigo(await pedir("business/message/send", texto("u-ventana"))), 0);
      const real = Date.now;
      Date.now = () => real() + 49 * 3600_000;
      try {
        assert.equal(await codigo(await pedir("business/message/send", texto("u-ventana"))), 40010);
      } finally {
        Date.now = real;
      }
    });

    test("un usuario que la simulación nunca vio (por ejemplo, tras reiniciar el servidor) se deja pasar", async () => {
      assert.equal(await codigo(await pedir("business/message/send", texto("u-desconocido"))), 0);
    });

    test("el adaptador y la API simulada se entienden: el envío llega, y el 11.º falla con el código de TikTok", async () => {
      process.env.TIKTOK_API_URL = "http://localhost:3000/api/simulador/tiktok";
      try {
        globalThis.fetch = (async (u: string | URL, init?: RequestInit) => apiSimulada(new URL(String(u)).pathname.replace("/api/simulador/tiktok/", "").replace(/\/$/, ""), new Request(String(u), init))) as typeof fetch;
        await entradaSimulada({ usuarioId: "u-punta", texto: "Hola" });
        const ids = new Set<string>();
        for (let i = 0; i < 10; i++) ids.add((await adaptadorTikTok.send("u-punta", { type: "text", text: `m${i}` })).externalMessageId);
        assert.equal(ids.size, 10);
        await assert.rejects(adaptadorTikTok.send("u-punta", { type: "text", text: "uno más" }), /TikTok respondió 400 \(código 40011\)/);
      } finally {
        delete process.env.TIKTOK_API_URL;
      }
    });

    test("lo que escribe el «cliente» entra como un aviso firmado y se lee igual que el real; una imagen y un texto son dos mensajes", async () => {
      const r = await entradaSimulada({ usuarioId: "u-entra", nombre: "Luis", texto: "Mi comprobante", imagen: { tipo: "image/png", datos: PNG } });
      assert.deepEqual(r.map((m) => [m.type, m.channel, m.externalContactId, m.contactName]), [["image", "tiktok", "u-entra", "Luis"], ["text", "tiktok", "u-entra", "Luis"]]);
      assert.match(r[0]!.mediaUrl!, /^\/api\/archivos\/.+\.png$/);
      archivos.push(r[0]!.mediaUrl!.replace("/api/archivos/", ""));
      assert.notEqual(r[0]!.externalMessageId, r[1]!.externalMessageId);
    });

    test("sin el canal activo, la entrada simulada avisa en vez de entrar a escondidas", async () => {
      process.env.CHANNELS_ENABLED = "simulado";
      try {
        await assert.rejects(entradaSimulada({ usuarioId: "u-x", texto: "Hola" }), /no está activo/);
      } finally {
        process.env.CHANNELS_ENABLED = "simulado,tiktok";
      }
    });
  });

  describe("conversaciones de TikTok (con base de datos)", () => {
    let convId: string;
    let usuarioId: string;
    const conv = () => db.conversation.findUniqueOrThrow({ where: { id: convId } });
    const mandar = (t: string, mensaje: Parameters<typeof enviarMensaje>[0]["mensaje"] = { type: "text", text: t }) => enviarMensaje({ conversacionId: convId, usuarioId, mensaje });

    before(async () => {
      usuarioId = (await db.user.create({ data: { nombre: `${P} agente`, correo: "prueba-tt@homeoutlet.test", passwordHash: "x", rol: "agente" } })).id;
      globalThis.fetch = fetchReal;
      const e = await recibirMensaje({ channel: "tiktok", externalContactId: "tt-conv-1", contactName: `${P} cliente`, externalMessageId: `tt-in-${Date.now()}`, type: "text", text: "Hola", timestamp: new Date() });
      convId = e.conversacionId!;
    });
    after(async () => {
      await db.user.deleteMany({ where: { correo: "prueba-tt@homeoutlet.test" } });
    });

    test("se responde dentro de la ventana, y a los 10 mensajes seguidos el sistema dice que hay que esperar al cliente", async () => {
      simular(enviosOk);
      assert.equal(await salientesRestantes(await conv()), 10);
      for (let i = 1; i <= 10; i++) assert.equal((await mandar(`mensaje ${i}`)).ok, true, `mensaje ${i}`);
      assert.equal(await salientesRestantes(await conv()), 0);
      const antes = await db.message.count({ where: { conversacionId: convId } });
      const r = await mandar("el número 11");
      assert.equal(r.ok, false);
      assert.match(!r.ok ? r.error : "", /10 mensajes seguidos.*vuelva a escribir/);
      assert.equal(await db.message.count({ where: { conversacionId: convId } }), antes, "no deja un mensaje a medias");
      assert.equal(llamadas.length, 10, "ni siquiera se llamó a TikTok");
    });

    test("cuando el cliente vuelve a escribir, el conteo empieza de nuevo", async () => {
      simular(enviosOk);
      await recibirMensaje({ channel: "tiktok", externalContactId: "tt-conv-1", externalMessageId: `tt-in2-${Date.now()}`, type: "text", text: "¿Siguen ahí?", timestamp: new Date() });
      await esperar(5);
      assert.equal(await salientesRestantes(await conv()), 10);
      assert.equal((await mandar("sí, dígame")).ok, true);
      assert.equal(await salientesRestantes(await conv()), 9);
    });

    test("una tarjeta de producto o una imagen con texto cuentan por dos (salen como dos mensajes)", async () => {
      simular(enviosOk);
      const antes = (await salientesRestantes(await conv()))!;
      assert.equal((await mandar("", { type: "product", productId: productoId })).ok, true);
      assert.equal(await salientesRestantes(await conv()), antes - 2);
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date() } }); // una tarjeta no cabe si solo queda 1
      await esperar(5);
      for (let i = 0; i < 9; i++) await mandar(`relleno ${i}`);
      const r = await mandar("", { type: "product", productId: productoId });
      assert.equal(r.ok, false);
    });

    test("lo que falló no cuenta, y reintentarlo respeta el tope", async () => {
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date() } });
      await esperar(5);
      simular(() => json({ code: 50000, message: "x" }, 500));
      const fallo = await mandar("este falla");
      assert.equal(fallo.ok, false);
      assert.equal(await salientesRestantes(await conv()), 10, "el fallo no gasta cupo");
      simular(enviosOk);
      const otra = await reintentarMensaje(!fallo.ok ? fallo.mensajeId! : "");
      assert.equal(otra.ok, true);
      assert.equal(await salientesRestantes(await conv()), 9);
    });

    test("pasadas las 48 horas el error es el de TikTok (sin plantillas); a las 30 horas todavía se puede", async () => {
      simular(enviosOk);
      await db.message.deleteMany({ where: { conversacionId: convId, direccion: "saliente" } }); // el conteo parte del último mensaje del cliente
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date(Date.now() - 30 * 3600_000) } });
      assert.equal((await mandar("a las 30 horas")).ok, true);
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date(Date.now() - 49 * 3600_000) } });
      const r = await mandar("a las 49 horas");
      assert.equal(r.ok, false);
      assert.match(!r.ok ? r.error : "", /48 horas.*vuelva a escribir/);
    });

    test("un texto largo cuenta por los mensajes en que sale partido, y si no caben todos no se manda ninguno", async () => {
      const largo = Array.from({ length: 60 }, (_, i) => `Línea ${i + 1} del resumen del pedido con algo de texto`).join("\n");
      const partes = contarMensajesTikTok({ type: "text", text: largo });
      assert.ok(partes >= 3, `salió en ${partes}`);
      assert.deepEqual([contarMensajesTikTok({ type: "text", text: "Hola" }), contarMensajesTikTok({ type: "product", productId: "x" }), contarMensajesTikTok({ type: "image", mediaUrl: "x" }), contarMensajesTikTok({ type: "image", mediaUrl: "x", text: "Mire" })], [1, 2, 1, 2]);

      await db.message.deleteMany({ where: { conversacionId: convId, direccion: "saliente" } });
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date() } });
      await esperar(5);
      simular(enviosOk);
      for (let i = 0; i < 10 - partes + 1; i++) assert.equal((await mandar(`relleno ${i}`)).ok, true); // deja un hueco de partes - 1
      assert.equal(await salientesRestantes(await conv()), partes - 1);
      llamadas = [];
      const r = await mandar(largo);
      assert.equal(r.ok, false);
      assert.equal(llamadas.length, 0, "no sale ni un trozo: nada de mensajes a medias");
    });

    test("el resumen de un pedido no se intenta mandar por el canal si ya se agotó el tope", async () => {
      await db.conversation.update({ where: { id: convId }, data: { lastInboundAt: new Date() } });
      await esperar(5);
      await db.message.deleteMany({ where: { conversacionId: convId, direccion: "saliente" } });
      assert.equal(await puedeEnviarPorCanal(convId), true);
      simular(enviosOk);
      for (let i = 0; i < 10; i++) await mandar(`m ${i}`);
      assert.equal(await puedeEnviarPorCanal(convId), false);
    });

    test("los canales sin tope no se ven afectados", async () => {
      const otra = await db.conversation.create({ data: { contactoId: (await conv()).contactoId, canal: "simulado", lastInboundAt: new Date() } });
      assert.equal(await salientesRestantes(otra), null);
    });
  });
});
