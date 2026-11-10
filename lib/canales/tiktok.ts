import { createHmac, timingSafeEqual } from "node:crypto";
import { almacenamiento, extensionDeImagen, NOMBRE_VALIDO, TIPOS } from "@/lib/almacenamiento";
import { guardarImagenEntrante, partirTexto } from "./meta-mensajeria";
import { ventanaAbierta } from "./ventana";
import { leyendaDeProducto } from "./whatsapp";
import type { ChannelAdapter, InboundMessage, OutboundMessage, StatusUpdate } from "./tipos";

/**
 * TikTok (mensajes directos de una cuenta TikTok Business), por la API de mensajes de TikTok para negocios.
 *
 * Variables de entorno: TIKTOK_ACCESS_TOKEN, TIKTOK_BUSINESS_ID (el id de la cuenta del negocio), TIKTOK_APP_SECRET (firma de los webhooks).
 * Opcional: TIKTOK_API_URL (por defecto la de TikTok; en desarrollo apunta a la API simulada: /api/simulador/tiktok).
 * Mientras falten, el canal aparece como pendiente de conexión y el registro no lo entrega.
 *
 * Reglas de TikTok que el sistema respeta: el cliente siempre escribe primero; se puede responder durante 48 horas desde su último
 * mensaje (ver ventana.ts) y hasta 10 mensajes seguidos sin que vuelva a escribir (`maxSalientes`, lo aplica mensajeria.ts). No hay
 * plantillas. Se envía texto e imagen (la tarjeta de producto es la imagen y, enseguida, su texto). Video y voz no se pueden enviar.
 * Entrada: texto e imágenes (se descargan y se guardan); lo demás llega como "unsupported".
 *
 * ESTO NO SE HA PROBADO CON TIKTOK REAL (falta la aprobación de TikTok): la forma exacta de las rutas, de los eventos y de la firma
 * es una SUPOSICIÓN razonable, no copiada de la documentación oficial. Está probado contra una simulación (lib/canales/tiktok-simulado.ts).
 * Al recibir el acceso hay que cotejar contra la documentación y ajustar solo este archivo: RUTA_ENVIO, RUTA_SUBIDA, los nombres de los
 * eventos en `interpretarTikTok` y el formato de la cabecera en `firmaTikTokValida`.
 */

export const TIKTOK_MAX_SALIENTES = 10;
const VARIABLES = ["TIKTOK_ACCESS_TOKEN", "TIKTOK_BUSINESS_ID", "TIKTOK_APP_SECRET"] as const;
export const tiktokFaltantes = () => VARIABLES.filter((v) => !process.env[v]);

const API_REAL = "https://business-api.tiktok.com/open_api/v1.3";
const RUTA_ENVIO = "business/message/send/";
const RUTA_SUBIDA = "business/message/media/upload/";
const MAX_TEXTO_BYTES = 1000; // ponytail: límite supuesto; si TikTok dice otro, cambiarlo aquí
const MAX_IMAGEN = 8 * 1024 * 1024;
const TOLERANCIA_S = 300; // un aviso con la firma de hace más de 5 minutos se rechaza (evita repetirlo)

const base = () => (process.env.TIKTOK_API_URL?.trim() || API_REAL).replace(/\/+$/, "");

/** Llamada a la API. El error nunca incluye el token ni el contenido del mensaje: solo el código HTTP y el de TikTok. */
async function llamar(ruta: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(`${base()}/${ruta}`, { ...init, headers: { "Access-Token": process.env.TIKTOK_ACCESS_TOKEN ?? "", ...(init.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as { code?: number; data?: Record<string, unknown> };
  if (!r.ok || j.code !== 0) throw new Error(`TikTok respondió ${r.status}${j.code ? ` (código ${j.code})` : ""}`);
  return j.data ?? {};
}

async function enviarA(a: string, mensaje: object) {
  const d = await llamar(RUTA_ENVIO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_id: process.env.TIKTOK_BUSINESS_ID, recipient_type: "USER", recipient: a, ...mensaje }),
  });
  if (typeof d.message_id !== "string" || !d.message_id) throw new Error("TikTok no devolvió el id del mensaje.");
  return d.message_id;
}

/** Imagen del sistema (`/api/archivos/<nombre>`) o con dirección https → se sube y se devuelve su id, o null si no se puede mandar. */
async function subirImagen(url: string): Promise<string | null> {
  let datos: Buffer | null = null;
  let ext: string | null = null;
  if (url.startsWith("/api/archivos/")) {
    const nombre = url.replace(/^\/api\/archivos\//, "");
    if (!NOMBRE_VALIDO.test(nombre)) return null;
    datos = await almacenamiento.leer(nombre);
    ext = nombre.split(".").pop() ?? null;
  } else if (/^https:\/\//.test(url)) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) datos = Buffer.from(await r.arrayBuffer());
    ext = datos && datos.length <= MAX_IMAGEN ? extensionDeImagen(datos) : null;
  }
  if (!datos || !ext || !TIPOS[ext]) return null;
  const form = new FormData();
  form.set("business_id", process.env.TIKTOK_BUSINESS_ID ?? "");
  form.set("media_type", "IMAGE");
  form.set("file", new Blob([new Uint8Array(datos)], { type: TIPOS[ext] }), `imagen.${ext}`);
  const id = (await llamar(RUTA_SUBIDA, { method: "POST", body: form })).media_id;
  return typeof id === "string" && id ? id : null;
}

async function enviar(a: string, m: OutboundMessage) {
  if (m.type === "template") throw new Error("TikTok no tiene plantillas.");
  let texto = m.text;
  let imagen = m.type === "image" ? m.mediaUrl : undefined;
  if (m.type === "product") {
    if (!m.productId) throw new Error("Falta el producto.");
    const t = await leyendaDeProducto(m.productId);
    texto = t.texto.replace(/\*/g, ""); // las negritas de WhatsApp (*así*) aquí se verían como asteriscos
    imagen = m.mediaUrl ?? t.imagen ?? undefined; // la foto que se eligió; si no, la principal
  }
  let ultimo: string | null = null;
  const mediaId = imagen ? await subirImagen(imagen) : null;
  if (mediaId) ultimo = await enviarA(a, { message_type: "IMAGE", image: { media_id: mediaId } });
  if (texto) for (const trozo of partirTexto(texto, MAX_TEXTO_BYTES)) ultimo = await enviarA(a, { message_type: "TEXT", text: { body: trozo } });
  if (!ultimo) throw new Error("No hay nada que enviar.");
  return { externalMessageId: ultimo }; // el del último trozo: es el que lleva la lectura de todo el mensaje
}

/* ── Firma del webhook: cabecera «Tiktok-Signature: t=<segundos>,s=<hex>», con s = HMAC-SHA256(secreto, "<t>.<cuerpo>") ── */
export function firmarTikTok(cuerpo: string, secreto: string, ahora = Date.now()) {
  const t = Math.floor(ahora / 1000);
  return `t=${t},s=${createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex")}`;
}

export function firmaTikTokValida(cuerpo: string, cabecera: string | null, secreto: string, ahora = Date.now()) {
  const partes = new Map((cabecera ?? "").split(",").map((p): [string, string] => [p.slice(0, p.indexOf("=")).trim(), p.slice(p.indexOf("=") + 1).trim()]));
  const t = Number(partes.get("t"));
  if (!Number.isFinite(t) || Math.abs(ahora / 1000 - t) > TOLERANCIA_S) return false;
  const esperada = createHmac("sha256", secreto).update(`${partes.get("t")}.${cuerpo}`).digest();
  const recibida = Buffer.from(partes.get("s") ?? "", "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/* ── Entrada ── */
type Contenido = { message_id?: string; message_type?: string; from_user?: { id?: string; display_name?: string }; text?: { body?: string }; image?: { url?: string }; target_message_id?: string };
type Evento = { event?: string; business_id?: string; timestamp?: number; content?: string | Contenido };

const vacio = () => ({ messages: [] as InboundMessage[], statuses: [] as StatusUpdate[] });

/** Eventos: «im_receive_msg» (escribió el cliente) y «im_mark_read_msg» (el cliente leyó un mensaje nuestro). Los ecos y lo demás se ignoran. */
export async function interpretarTikTok(cuerpo: unknown): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[] }> {
  const raiz = cuerpo as Evento | null;
  const r = vacio();
  if (!raiz || raiz.business_id !== process.env.TIKTOK_BUSINESS_ID) return r; // es de otra cuenta
  let c: Contenido;
  try {
    c = (typeof raiz.content === "string" ? JSON.parse(raiz.content) : raiz.content) ?? {};
  } catch {
    return r;
  }
  const cuando = new Date((raiz.timestamp ?? Date.now() / 1000) * 1000);

  if (raiz.event === "im_mark_read_msg") {
    if (c.target_message_id) r.statuses.push({ externalMessageId: c.target_message_id, status: "leido", timestamp: cuando });
    return r;
  }
  const de = c.from_user?.id;
  if (raiz.event !== "im_receive_msg" || !c.message_id || !de || de === raiz.business_id) return r;

  const base = { channel: "tiktok" as const, externalContactId: de, contactName: c.from_user?.display_name?.trim() || undefined, externalMessageId: c.message_id, timestamp: cuando };
  if (c.message_type === "text" && c.text?.body) r.messages.push({ ...base, type: "text", text: c.text.body });
  else if (c.message_type === "image" && c.image?.url) {
    const mediaUrl = await guardarImagenEntrante(c.image.url);
    r.messages.push(mediaUrl ? { ...base, type: "image", mediaUrl } : { ...base, type: "unsupported" });
  } else r.messages.push({ ...base, type: "unsupported" }); // video, voz, publicaciones compartidas…
  return r;
}

/** Cuántos mensajes de TikTok ocupa un envío: la imagen (o la foto del producto) más cada trozo de texto. Es lo que cuenta contra el tope. */
export function contarMensajesTikTok(m: OutboundMessage) {
  if (m.type === "product") return 2; // la foto y su texto corto
  return Math.max(1, (m.type === "image" ? 1 : 0) + (m.text ? partirTexto(m.text, MAX_TEXTO_BYTES).length : 0));
}

export const adaptadorTikTok: ChannelAdapter = {
  channel: "tiktok",
  maxSalientes: TIKTOK_MAX_SALIENTES,
  contarMensajes: contarMensajesTikTok,
  send: enviar,
  canSendFreeForm: (c) => ventanaAbierta(c.lastInboundAt, new Date(), "tiktok"),
  parseWebhook: async (req) => interpretarTikTok(await req.json()),
  async verifyWebhook(req) {
    const secreto = process.env.TIKTOK_APP_SECRET;
    return !!secreto && firmaTikTokValida(await req.text(), req.headers.get("tiktok-signature"), secreto);
  },
};
