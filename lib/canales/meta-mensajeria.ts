import { almacenamiento, extensionDeImagen, NOMBRE_VALIDO, TIPOS } from "@/lib/almacenamiento";
import { explicacionMeta, firmaValida, leyendaDeProducto } from "./whatsapp";
import { ventanaAbierta } from "./ventana";
import { ErrorDeCanal, type ChannelAdapter, type InboundMessage, type OutboundMessage, type StatusUpdate } from "./tipos";

/**
 * Facebook Messenger e Instagram (mensajes directos), por la API de mensajería de Meta. Las dos usan la misma forma de
 * enviar (POST /me/messages con el token de la página) y de recibir (webhook con entry[].messaging[]), así que comparten este archivo.
 *
 * Variables de entorno (por canal; los secretos y el token de verificación pueden repetirse si es la misma app de Meta):
 *   Facebook:  FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID, FACEBOOK_APP_SECRET, FACEBOOK_VERIFY_TOKEN
 *   Instagram: INSTAGRAM_TOKEN (token de la página vinculada), INSTAGRAM_ACCOUNT_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_VERIFY_TOKEN
 * Mientras falten, el canal aparece como pendiente de conexión y el registro no lo entrega.
 *
 * Envío: texto (si pasa del límite del canal se parte en varios mensajes, por líneas), imagen y tarjeta de producto
 * (la imagen y, enseguida, su texto: estos canales no tienen pie de foto). Las imágenes del sistema están detrás de la sesión:
 * en Facebook se suben con la API de adjuntos y se mandan por id; Instagram solo acepta imágenes por dirección pública (https),
 * así que sin una dirección pública se manda solo el texto. No hay plantillas: fuera de la ventana de 24 horas no se envía nada.
 * Entrada: texto e imágenes (se descargan y se guardan). Audio, video, archivos, historias y reacciones llegan como "unsupported".
 * Estados: Facebook avisa «entregado» por mensaje; Instagram avisa «leído» por mensaje. Lo demás no se puede ligar a un mensaje y se ignora.
 *
 * ESTO NO SE HA PROBADO CON META REAL (falta la cuenta): está probado contra una simulación de la API, siguiendo su documentación.
 */

export type Plataforma = "facebook" | "instagram";

const GRAPH = "https://graph.facebook.com/v25.0";
const CONFIG = {
  facebook: { nombre: "Facebook", token: "FACEBOOK_PAGE_TOKEN", cuenta: "FACEBOOK_PAGE_ID", secreto: "FACEBOOK_APP_SECRET", verificacion: "FACEBOOK_VERIFY_TOKEN", maxBytes: 1900 },
  instagram: { nombre: "Instagram", token: "INSTAGRAM_TOKEN", cuenta: "INSTAGRAM_ACCOUNT_ID", secreto: "INSTAGRAM_APP_SECRET", verificacion: "INSTAGRAM_VERIFY_TOKEN", maxBytes: 950 },
} as const;
const MAX_IMAGEN = 8 * 1024 * 1024; // el límite de Meta para imágenes

export const metaFaltantes = (p: Plataforma) => (["token", "cuenta", "secreto", "verificacion"] as const).map((k) => CONFIG[p][k]).filter((v) => !process.env[v]);

/** Parte un texto en trozos de a lo más `maxBytes` (UTF-8), cortando por líneas y, si una línea es muy larga, por palabras. */
export function partirTexto(texto: string, maxBytes: number): string[] {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const trozos: string[] = [];
  let actual = "";
  const cerrar = () => {
    if (actual.trim()) trozos.push(actual.trim());
    actual = "";
  };
  const agregar = (pedazo: string, union: string) => {
    if (actual && bytes(actual + union + pedazo) > maxBytes) cerrar();
    actual = actual ? actual + union + pedazo : pedazo;
  };
  for (const linea of texto.trim().split("\n")) {
    if (bytes(linea) <= maxBytes) {
      agregar(linea, "\n");
      continue;
    }
    for (const palabra of linea.split(" ")) {
      if (bytes(palabra) <= maxBytes) agregar(palabra, " ");
      else for (const c of palabra) agregar(c, ""); // una «palabra» enorme (una dirección, por ejemplo): se corta por letras
    }
  }
  cerrar();
  return trozos;
}

/** Llamada a la API de Meta. El error nunca incluye el token ni el contenido del mensaje: solo el código HTTP, el de Meta y nuestra explicación. */
async function llamar(p: Plataforma, ruta: string, init: RequestInit = {}) {
  const r = await fetch(`${GRAPH}/${ruta}`, { ...init, headers: { Authorization: `Bearer ${process.env[CONFIG[p].token]}`, ...(init.headers ?? {}) } });
  if (!r.ok) {
    const e = await r.json().then((j: { error?: { code?: number } }) => j.error).catch(() => undefined);
    throw new ErrorDeCanal(CONFIG[p].nombre, r.status, e?.code, explicacionMeta(e?.code));
  }
  return r;
}

async function enviarA(p: Plataforma, a: string, message: object) {
  const r = await llamar(p, "me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: a }, ...(p === "facebook" ? { messaging_type: "RESPONSE" } : {}), message }),
  });
  const id = ((await r.json()) as { message_id?: string }).message_id;
  if (!id) throw new Error(`${CONFIG[p].nombre} no devolvió el id del mensaje.`);
  return id;
}

/** Imagen del sistema (`/api/archivos/<nombre>`) → adjunto listo para enviar, o null si este canal no la puede mandar. */
async function adjuntoDeImagen(p: Plataforma, url: string): Promise<object | null> {
  if (/^https:\/\//.test(url)) return { type: "image", payload: { url, is_reusable: false } };
  if (p === "instagram") return null; // Instagram no recibe archivos subidos, solo direcciones públicas
  const nombre = url.replace(/^\/api\/archivos\//, "");
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  const datos = await almacenamiento.leer(nombre);
  if (!datos) return null;
  const tipo = TIPOS[nombre.split(".").pop()!]!;
  const form = new FormData();
  form.set("message", JSON.stringify({ attachment: { type: "image", payload: { is_reusable: true } } }));
  form.set("filedata", new Blob([new Uint8Array(datos)], { type: tipo }), nombre);
  const r = await llamar(p, "me/message_attachments", { method: "POST", body: form });
  const id = ((await r.json()) as { attachment_id?: string }).attachment_id;
  return id ? { type: "image", payload: { attachment_id: id } } : null;
}

async function enviar(p: Plataforma, a: string, m: OutboundMessage) {
  if (m.type === "template") throw new Error(`${CONFIG[p].nombre} no tiene plantillas.`);
  let texto = m.text;
  let imagen = m.type === "image" ? m.mediaUrl : undefined;
  if (m.type === "product") {
    if (!m.productId) throw new Error("Falta el producto.");
    const t = await leyendaDeProducto(m.productId);
    texto = t.texto.replace(/\*/g, ""); // las negritas de WhatsApp (*así*) aquí se verían como asteriscos
    imagen = m.mediaUrl ?? t.imagen ?? undefined; // la foto que se eligió; si no, la principal
  }
  let ultimo: string | null = null;
  const adjunto = imagen ? await adjuntoDeImagen(p, imagen) : null;
  if (adjunto) ultimo = await enviarA(p, a, { attachment: adjunto });
  if (texto) for (const trozo of partirTexto(texto, CONFIG[p].maxBytes)) ultimo = await enviarA(p, a, { text: trozo });
  if (!ultimo) throw new Error("No hay nada que enviar.");
  return { externalMessageId: ultimo }; // el del último trozo: es el que lleva la entrega y la lectura de todo el mensaje
}

/* ── Entrada ── */
type Evento = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[] };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { mid?: string; watermark?: number };
};

const nombres = new Map<string, { nombre: string | undefined; hasta: number }>();
/** Nombre del perfil (lo mejor que se pueda; si Meta no lo da, el contacto queda sin nombre). Se recuerda una hora. */
async function nombreDePerfil(p: Plataforma, id: string): Promise<string | undefined> {
  const clave = `${p}:${id}`;
  const guardado = nombres.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.nombre;
  let nombre: string | undefined;
  try {
    const j = (await (await llamar(p, `${id}?fields=${p === "instagram" ? "name,username" : "name"}`)).json()) as { name?: string; username?: string };
    nombre = j.name || j.username || undefined;
  } catch {
    nombre = undefined;
  }
  nombres.set(clave, { nombre, hasta: Date.now() + 3_600_000 });
  return nombre;
}

/** Descarga una imagen entrante (la dirección es pública y temporal) y la guarda. null si no se pudo o pesa demasiado. */
export async function guardarImagenEntrante(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const datos = Buffer.from(await r.arrayBuffer());
    if (datos.length > MAX_IMAGEN) return null;
    const ext = extensionDeImagen(datos);
    return ext ? (await almacenamiento.guardar(datos, ext)).url : null;
  } catch {
    return null;
  }
}

export async function interpretarMeta(p: Plataforma, cuerpo: unknown): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[] }> {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const esperado = p === "facebook" ? "page" : "instagram";
  const raiz = cuerpo as { object?: string; entry?: { id?: string; messaging?: Evento[] }[] };
  if (raiz?.object !== esperado) return { messages, statuses };

  for (const entrada of raiz.entry ?? []) {
    if (entrada.id !== process.env[CONFIG[p].cuenta]) continue; // es de otra página o cuenta
    for (const e of entrada.messaging ?? []) {
      const cuando = new Date(e.timestamp ?? Date.now());
      if (e.delivery?.mids) for (const mid of e.delivery.mids) statuses.push({ externalMessageId: mid, status: "entregado", timestamp: cuando });
      if (e.read?.mid) statuses.push({ externalMessageId: e.read.mid, status: "leido", timestamp: cuando });

      const m = e.message;
      const de = e.sender?.id;
      if (!m?.mid || !de || m.is_echo || de === entrada.id) continue; // los ecos son lo que mandamos nosotros
      const base = { channel: p, externalContactId: de, contactName: await nombreDePerfil(p, de), timestamp: cuando };
      const imagenes = (m.attachments ?? []).filter((a) => a.type === "image" && a.payload?.url);
      if (imagenes.length) {
        let n = 0;
        for (const a of imagenes) {
          const mediaUrl = await guardarImagenEntrante(a.payload!.url!);
          const id = n++ === 0 ? m.mid : `${m.mid}:${n}`;
          messages.push(mediaUrl ? { ...base, externalMessageId: id, type: "image", text: n === 1 ? m.text : undefined, mediaUrl } : { ...base, externalMessageId: id, type: "unsupported", text: n === 1 ? m.text : undefined });
        }
      } else if (m.text) messages.push({ ...base, externalMessageId: m.mid, type: "text", text: m.text });
      else messages.push({ ...base, externalMessageId: m.mid, type: "unsupported" });
    }
  }
  return { messages, statuses };
}

/** Respuesta al GET de suscripción: devuelve hub.challenge si el token coincide, o null. */
export function verificarSuscripcionMeta(p: Plataforma, url: URL) {
  const esperado = process.env[CONFIG[p].verificacion];
  const q = url.searchParams;
  return esperado && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === esperado ? q.get("hub.challenge") : null;
}

export const crearAdaptadorMeta = (p: Plataforma): ChannelAdapter => ({
  channel: p,
  send: (a, m) => enviar(p, a, m),
  canSendFreeForm: (c) => ventanaAbierta(c.lastInboundAt),
  parseWebhook: async (req) => interpretarMeta(p, await req.json()),
  verifySubscription: (url) => verificarSuscripcionMeta(p, url),
  async verifyWebhook(req) {
    const secreto = process.env[CONFIG[p].secreto];
    return !!secreto && firmaValida(await req.text(), req.headers.get("x-hub-signature-256"), secreto);
  },
});

export const adaptadorFacebook = crearAdaptadorMeta("facebook");
export const adaptadorInstagram = crearAdaptadorMeta("instagram");
