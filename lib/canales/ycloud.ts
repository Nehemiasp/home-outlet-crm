import { createHmac, timingSafeEqual } from "node:crypto";
import { almacenamiento, extensionDeImagen, NOMBRE_VALIDO, TIPOS } from "@/lib/almacenamiento";
import { ventanaAbierta } from "./ventana";
import { explicacionMeta, leyendaDeProducto, plantillaSoportada, type PlantillaMeta } from "./whatsapp";
import { ErrorDeCanal, type ChannelAdapter, type InboundMessage, type MensajeSincronizado, type OutboundMessage, type PlantillaCanal, type StatusUpdate } from "./tipos";

/**
 * WhatsApp por YCloud (proveedor oficial de Meta). Se usa en lugar de la conexión directa con Meta cuando
 * WHATSAPP_PROVEEDOR=ycloud, sobre todo por la **coexistencia**: el mismo número sigue funcionando en la app de WhatsApp
 * Business del celular (y en WhatsApp Web) y, a la vez, en el CRM. El canal sigue siendo «whatsapp» y el webhook,
 * /api/webhooks/whatsapp.
 *
 * Variables: YCLOUD_API_KEY (Developers → API Keys), YCLOUD_WEBHOOK_SECRET (el `secret` del webhook creado en YCloud),
 * YCLOUD_NUMERO (el número del negocio en formato E.164, «+502…»). Opcional: YCLOUD_WABA_ID (para listar las plantillas).
 *
 * Envío: POST /v2/whatsapp/messages/sendDirectly, con el mismo formato de mensaje que la API de Meta. Las imágenes y PDF del
 * sistema se suben antes (POST /v2/whatsapp/media/{número}/upload) y se mandan por su id.
 * Entrada (webhook firmado con YCloud-Signature: «t=<segundos>,s=<hmac-sha256 hex de "t." + cuerpo>»):
 *   whatsapp.inbound_message.received  → mensaje del cliente (texto e imágenes; lo demás como «unsupported»).
 *   whatsapp.message.updated           → estado de un mensaje nuestro (enviado, entregado, leído, falló).
 *   whatsapp.smb.message.echoes/.created → lo que el equipo escribió desde la app del celular o WhatsApp Web (coexistencia).
 *   whatsapp.smb.history               → el historial sincronizado al conectar (hasta 6 meses de chats individuales).
 * ESTO NO SE HA PROBADO CON YCLOUD REAL: está hecho según su documentación (nov 2026) y probado contra una simulación.
 */

const API = "https://api.ycloud.com/v2";
const VARIABLES = ["YCLOUD_API_KEY", "YCLOUD_WEBHOOK_SECRET", "YCLOUD_NUMERO"] as const;
export const ycloudFaltantes = () => VARIABLES.filter((v) => !process.env[v]);
/** Cinco minutos de tolerancia en la hora de la firma, como recomienda YCloud (evita que reenvíen una petición vieja). */
const TOLERANCIA_S = 300;

/** «+50255551234» siempre con «+»: así se guarda la identidad de WhatsApp en el CRM, venga de Meta o de YCloud. */
const e164 = (n: string) => `+${n.replace(/\D/g, "")}`;
const numeroPropio = () => e164(process.env.YCLOUD_NUMERO ?? "");

/** Valida YCloud-Signature («t=<segundos>,s=<hex>») sobre el cuerpo crudo: HMAC-SHA256 de "<t>." + cuerpo con el secreto del webhook. */
export function firmaYCloudValida(cuerpoCrudo: string, cabecera: string | null, secreto: string, ahora = Date.now()) {
  if (!cabecera || !secreto) return false;
  const campos = cabecera.split(",").map((p) => p.trim().split("=") as [string, string | undefined]);
  const tiempos = campos.filter(([k]) => k === "t").map(([, v]) => v ?? "");
  const firmas = campos.filter(([k]) => k === "s").map(([, v]) => v ?? "");
  if (tiempos.length !== 1 || !/^\d{1,12}$/.test(tiempos[0]!)) return false;
  if (Math.abs(Math.floor(ahora / 1000) - Number(tiempos[0])) > TOLERANCIA_S) return false;
  const esperada = createHmac("sha256", secreto).update(`${tiempos[0]}.`).update(cuerpoCrudo).digest();
  return firmas.some((f) => /^[a-fA-F0-9]{64}$/.test(f) && timingSafeEqual(esperada, Buffer.from(f, "hex")));
}

/** Llamada a la API de YCloud. El error nunca lleva la clave ni el contenido: el código HTTP y el código de Meta (o el de YCloud). */
async function llamar(ruta: string, init: RequestInit = {}) {
  const r = await fetch(ruta.startsWith("http") ? ruta : `${API}/${ruta}`, { ...init, headers: { "X-API-Key": process.env.YCLOUD_API_KEY ?? "", ...(init.headers ?? {}) } });
  if (!r.ok) {
    const e = await r.json().then((j: { error?: { code?: string; whatsappApiError?: { code?: number } } }) => j.error).catch(() => undefined);
    const meta = e?.whatsappApiError?.code;
    // El código de YCloud es un nombre fijo («PARAM_INVALID»), no texto del cliente: se puede registrar.
    throw new ErrorDeCanal("YCloud", r.status, meta ?? (e?.code && /^[A-Z0-9_]{1,60}$/.test(e.code) ? e.code : undefined), explicacionMeta(meta));
  }
  return r;
}

/** Envía y devuelve el id con que llegan después los estados: el wamid de WhatsApp si YCloud ya lo tiene; si no, el id de YCloud. */
async function enviarA(cuerpo: object) {
  const r = await llamar("whatsapp/messages/sendDirectly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: numeroPropio(), ...cuerpo }) });
  const j = (await r.json()) as { id?: string; wamid?: string };
  const id = j.wamid || j.id;
  if (!id) throw new Error("YCloud no devolvió el id del mensaje.");
  return { externalMessageId: id };
}

/** Imagen o PDF del sistema (`/api/archivos/<nombre>`) → id de medio (se sube a YCloud). Una dirección pública se manda por enlace. */
async function medioParaEnviar(url: string, soloPdf = false): Promise<{ id: string } | { link: string } | null> {
  if (/^https:\/\//.test(url)) return { link: url };
  const nombre = url.replace(/^\/api\/archivos\//, "");
  if (!NOMBRE_VALIDO.test(nombre) || nombre.endsWith(".pdf") !== soloPdf) return null;
  const datos = await almacenamiento.leer(nombre);
  if (!datos) return null;
  const tipo = TIPOS[nombre.split(".").pop()!]!;
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(datos)], { type: tipo }), nombre);
  const r = await llamar(`whatsapp/media/${encodeURIComponent(numeroPropio())}/upload`, { method: "POST", body: form });
  const id = ((await r.json()) as { id?: string }).id;
  return id ? { id } : null;
}

async function enviar(to: string, m: OutboundMessage) {
  const destino = { to: e164(to) };
  if (m.type === "template") {
    if (!m.template) throw new Error("Falta la plantilla.");
    const t = m.template;
    return enviarA({
      ...destino,
      type: "template",
      template: { name: t.nombre, language: { code: t.idioma }, ...(t.parametros.length ? { components: [{ type: "body", parameters: t.parametros.map((text) => ({ type: "text", text })) }] } : {}) },
    });
  }
  if (m.type === "document") {
    const medio = m.mediaUrl ? await medioParaEnviar(m.mediaUrl, true) : null;
    if (!medio) throw new Error("No se encontró el documento.");
    return enviarA({ ...destino, type: "document", document: { ...medio, filename: m.filename ?? "documento.pdf", ...(m.text ? { caption: m.text } : {}) } });
  }
  let texto = m.text;
  let imagen = m.type === "image" ? m.mediaUrl : undefined;
  if (m.type === "product") {
    if (!m.productId) throw new Error("Falta el producto.");
    const t = await leyendaDeProducto(m.productId);
    texto = t.texto;
    imagen = m.mediaUrl ?? t.imagen ?? undefined;
  }
  const medio = imagen ? await medioParaEnviar(imagen) : null;
  if (medio) return enviarA({ ...destino, type: "image", image: { ...medio, ...(texto ? { caption: texto } : {}) } });
  if (!texto) throw new Error("No hay nada que enviar.");
  return enviarA({ ...destino, type: "text", text: { body: texto, preview_url: false } });
}

/* ── Plantillas ── */
let copiaPlantillas: { datos: PlantillaCanal[]; hasta: number } | null = null;
export const olvidarPlantillasYCloud = () => {
  copiaPlantillas = null;
};

async function plantillas(): Promise<PlantillaCanal[]> {
  if (copiaPlantillas && copiaPlantillas.hasta > Date.now()) return copiaPlantillas.datos;
  const waba = process.env.YCLOUD_WABA_ID;
  const q = new URLSearchParams({ limit: "100", "filter.status": "APPROVED", ...(waba ? { "filter.wabaId": waba } : {}) });
  const r = await llamar(`whatsapp/templates?${q}`);
  const datos = ((await r.json()) as { items?: PlantillaMeta[] }).items?.map(plantillaSoportada).filter((p): p is PlantillaCanal => !!p) ?? [];
  copiaPlantillas = { datos, hasta: Date.now() + 60_000 };
  return datos;
}

/* ── Entrada ── */
type Contenido = {
  id?: string;
  wamid?: string;
  from?: string;
  to?: string;
  type?: string;
  sendTime?: string;
  createTime?: string;
  status?: string;
  customerProfile?: { name?: string; username?: string };
  text?: { body?: string };
  image?: { link?: string; caption?: string };
};
type Evento = { id?: string; type?: string; whatsappInboundMessage?: Contenido; whatsappMessage?: Contenido };

const ESTADOS: Record<string, StatusUpdate["status"]> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallo" };
const fechaDe = (c: Contenido) => {
  const f = new Date(c.sendTime ?? c.createTime ?? "");
  return Number.isNaN(f.getTime()) ? new Date() : f;
};

/** Descarga una imagen de YCloud (el enlace se pide con la clave; vale 30 días) y la guarda. null si no se pudo. */
async function guardarImagen(link: string): Promise<string | null> {
  try {
    if (!/^https:\/\/api\.ycloud\.com\//.test(link)) return null; // solo de YCloud: nunca se pide una dirección arbitraria con la clave
    const datos = Buffer.from(await (await llamar(link)).arrayBuffer());
    const ext = extensionDeImagen(datos);
    return ext ? (await almacenamiento.guardar(datos, ext)).url : null;
  } catch {
    return null;
  }
}

/** Texto e imagen de un mensaje (cualquier dirección). `conImagen` falso: no se descarga (el historial viejo no se trae). */
async function contenidoDe(c: Contenido, conImagen: boolean): Promise<Pick<InboundMessage, "type" | "text" | "mediaUrl">> {
  if (c.type === "text" && c.text?.body) return { type: "text", text: c.text.body };
  if (c.type === "image" && c.image) {
    const mediaUrl = conImagen && c.image.link ? await guardarImagen(c.image.link) : null;
    return mediaUrl ? { type: "image", text: c.image.caption, mediaUrl } : { type: "unsupported", text: c.image.caption };
  }
  return { type: "unsupported" };
}

export async function interpretarEventoYCloud(cuerpo: unknown): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[]; ecos: MensajeSincronizado[]; historial: MensajeSincronizado[] }> {
  const vacio = { messages: [] as InboundMessage[], statuses: [] as StatusUpdate[], ecos: [] as MensajeSincronizado[], historial: [] as MensajeSincronizado[] };
  const e = cuerpo as Evento;
  const propio = numeroPropio();
  // Del cliente al negocio: el cliente es `from`. Del negocio al cliente: el cliente es `to`. Lo de otro número se ignora.
  const entrante = e.whatsappInboundMessage;
  const saliente = e.whatsappMessage;

  if (e.type === "whatsapp.inbound_message.received" && entrante?.from) {
    if (entrante.to && e164(entrante.to) !== propio) return vacio;
    const id = entrante.wamid || entrante.id;
    if (!id) return vacio;
    vacio.messages.push({ channel: "whatsapp", externalContactId: e164(entrante.from), contactName: entrante.customerProfile?.name, externalMessageId: id, timestamp: fechaDe(entrante), ...(await contenidoDe(entrante, true)) });
    return vacio;
  }
  if (e.type === "whatsapp.message.updated" && saliente) {
    const status = saliente.status ? ESTADOS[saliente.status] : undefined;
    // Se guardó con el wamid o, si YCloud todavía no lo tenía, con su id: se avisa por los dos (el que no existe no hace nada).
    if (status) for (const id of new Set([saliente.wamid, saliente.id].filter((x): x is string => !!x))) vacio.statuses.push({ externalMessageId: id, status, timestamp: fechaDe(saliente) });
    return vacio;
  }
  if ((e.type === "whatsapp.smb.message.echoes" || e.type === "whatsapp.smb.message.created") && saliente?.to) {
    if (saliente.from && e164(saliente.from) !== propio) return vacio;
    const id = saliente.wamid || saliente.id;
    if (!id) return vacio;
    vacio.ecos.push({ channel: "whatsapp", direccion: "saliente", externalContactId: e164(saliente.to), contactName: saliente.customerProfile?.name, externalMessageId: id, timestamp: fechaDe(saliente), ...(await contenidoDe(saliente, true)) });
    return vacio;
  }
  if (e.type === "whatsapp.smb.history") {
    // Cada evento trae un mensaje (o ninguno: solo el avance de la sincronización). Las fotos del historial no se descargan.
    const m = entrante?.from ? { c: entrante, direccion: "entrante" as const, cliente: entrante.from } : saliente?.to ? { c: saliente, direccion: "saliente" as const, cliente: saliente.to } : null;
    const id = m && (m.c.wamid || m.c.id);
    if (m && id) vacio.historial.push({ channel: "whatsapp", direccion: m.direccion, externalContactId: e164(m.cliente), contactName: m.direccion === "entrante" ? m.c.customerProfile?.name : undefined, externalMessageId: id, timestamp: fechaDe(m.c), ...(await contenidoDe(m.c, false)) });
    return vacio;
  }
  return vacio;
}

export const adaptadorYCloud: ChannelAdapter = {
  channel: "whatsapp",
  send: enviar,
  enviaDocumentos: true,
  listTemplates: plantillas,
  canSendFreeForm: (conversacion) => ventanaAbierta(conversacion.lastInboundAt),
  parseWebhook: async (req) => interpretarEventoYCloud(await req.json()),
  async verifyWebhook(req) {
    const secreto = process.env.YCLOUD_WEBHOOK_SECRET;
    return !!secreto && firmaYCloudValida(await req.text(), req.headers.get("ycloud-signature"), secreto);
  },
};
