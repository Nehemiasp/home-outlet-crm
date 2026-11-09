import { createHmac, timingSafeEqual } from "node:crypto";
import { almacenamiento, extensionDeImagen, NOMBRE_VALIDO, TIPOS } from "@/lib/almacenamiento";
import { formatQ } from "@/lib/utils";
import { ventanaAbierta } from "./ventana";
import { contarVariables } from "./plantillas-canal";
import type { ChannelAdapter, InboundMessage, OutboundMessage, PlantillaCanal, StatusUpdate } from "./tipos";

/**
 * WhatsApp Business Platform (Cloud API).
 *
 * Variables de entorno: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN.
 * Mientras falten, el canal aparece como "Pendiente de conexión" y el registro no lo entrega.
 *
 * Envío: texto, imagen y tarjeta de producto (imagen con pie de foto). Las imágenes del sistema están detrás de la sesión,
 * así que no se mandan por enlace: se suben a WhatsApp (POST /media) y se envían por su id.
 * Entrada: texto e imágenes (se descargan y se guardan con `almacenamiento`). Audio, video, documentos, ubicaciones, stickers,
 * reacciones y botones llegan como "unsupported".
 * Fuera de la ventana de 24 horas solo se pueden enviar plantillas aprobadas: `listTemplates` las pide a Meta (hace falta
 * WHATSAPP_BUSINESS_ACCOUNT_ID, que es opcional: sin él no hay plantillas) y `send` con type "template" las manda.
 * Solo se ofrecen las que el sistema sabe llenar (variables numeradas en el cuerpo; sin medios ni variables en botones).
 * `canSendFreeForm` impide enviar texto libre fuera de la ventana.
 */

const GRAPH = "https://graph.facebook.com/v25.0";
const VARIABLES = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"] as const;
export const whatsappFaltantes = () => VARIABLES.filter((v) => !process.env[v]);

/** Valida la cabecera X-Hub-Signature-256 ("sha256=<hex>") contra el cuerpo crudo con el secreto de la app. */
export function firmaValida(cuerpoCrudo: string, cabecera: string | null, secreto: string) {
  if (!cabecera?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpoCrudo).digest();
  const recibida = Buffer.from(cabecera.slice(7), "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Respuesta al GET de suscripción: devuelve hub.challenge si el token coincide, o null. */
export function verificarSuscripcion(url: URL) {
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  const p = url.searchParams;
  return esperado && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === esperado ? p.get("hub.challenge") : null;
}

/** Llamada a la API de Meta. El error nunca incluye el token ni el contenido del mensaje: solo el código HTTP y el de Meta. */
async function llamar(ruta: string, init: RequestInit = {}) {
  const r = await fetch(ruta.startsWith("http") ? ruta : `${GRAPH}/${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    const codigo = await r.json().then((j: { error?: { code?: number } }) => j.error?.code).catch(() => undefined);
    throw new Error(`WhatsApp respondió ${r.status}${codigo ? ` (código ${codigo})` : ""}`);
  }
  return r;
}

const enviarA = async (cuerpo: object) => {
  const r = await llamar(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }) });
  const id = ((await r.json()) as { messages?: { id?: string }[] }).messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp no devolvió el id del mensaje.");
  return { externalMessageId: id };
};

/** Imagen o PDF del sistema (`/api/archivos/<nombre>`) → id de medio de WhatsApp. Una dirección pública se manda por enlace. */
async function imagenParaEnviar(url: string, soloPdf = false): Promise<{ id: string } | { link: string } | null> {
  if (/^https:\/\//.test(url)) return { link: url };
  const nombre = url.replace(/^\/api\/archivos\//, "");
  if (!NOMBRE_VALIDO.test(nombre) || nombre.endsWith(".pdf") !== soloPdf) return null; // una imagen no sale como documento ni al revés
  const datos = await almacenamiento.leer(nombre);
  if (!datos) return null;
  const tipo = TIPOS[nombre.split(".").pop()!]!;
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", tipo);
  form.set("file", new Blob([new Uint8Array(datos)], { type: tipo }), nombre);
  const r = await llamar(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, { method: "POST", body: form });
  const id = ((await r.json()) as { id?: string }).id;
  return id ? { id } : null;
}

/** Tarjeta de producto en texto: nombre, precio y existencia. */
export async function leyendaDeProducto(productId: string) {
  const { db } = await import("@/lib/db"); // se carga al usarlo para que las pruebas de firma no necesiten la base
  const p = await db.product.findUnique({ where: { id: productId }, include: { stock: true } });
  if (!p) throw new Error("El producto ya no existe.");
  const disponible = p.stock.reduce((s, x) => s + Math.max(0, x.cantidad - x.apartado), 0);
  const existencia = disponible === 0 ? "Sin existencia por ahora" : disponible <= 3 ? `Quedan ${disponible}` : "En existencia";
  return { texto: `*${p.nombre}*\n${formatQ(p.precio)}\n${existencia}`, imagen: p.imagenes[0] ?? null };
}

/* ── Plantillas aprobadas (fuera de la ventana de 24 horas son lo único que se puede enviar) ── */
type ComponentePlantilla = { type: string; format?: string; text?: string; buttons?: { type: string; url?: string }[] };
type PlantillaMeta = { name: string; language: string; status: string; category: string; components?: ComponentePlantilla[] };

/** Solo las que el sistema sabe llenar: variables numeradas en el cuerpo y nada de medios, ni códigos, ni variables en botones. */
function plantillaSoportada(p: PlantillaMeta): PlantillaCanal | null {
  if (p.status !== "APPROVED" || p.category === "AUTHENTICATION") return null;
  const partes = p.components ?? [];
  if (partes.some((c) => !["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(c.type))) return null; // carrusel, ofertas limitadas, etc.
  const cuerpo = partes.find((c) => c.type === "BODY")?.text;
  const encabezado = partes.find((c) => c.type === "HEADER");
  const pie = partes.find((c) => c.type === "FOOTER")?.text;
  if (!cuerpo || /\{\{\D/.test(cuerpo)) return null; // variables con nombre: no
  if (encabezado && (encabezado.format !== "TEXT" || /\{\{/.test(encabezado.text ?? ""))) return null;
  const botones = partes.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  if (botones.some((b) => !["QUICK_REPLY", "PHONE_NUMBER", "URL"].includes(b.type) || /\{\{/.test(b.url ?? ""))) return null;
  const texto = [encabezado?.text, cuerpo, pie].filter(Boolean).join("\n\n"); // texto plano: así se lee igual en la bandeja
  return { nombre: p.name, idioma: p.language, categoria: p.category, cuerpo: texto, variables: contarVariables(cuerpo) };
}

let copiaPlantillas: { datos: PlantillaCanal[]; hasta: number } | null = null;
/** Para las pruebas: olvida la copia. */
export const olvidarPlantillas = () => {
  copiaPlantillas = null;
};

async function plantillas(): Promise<PlantillaCanal[]> {
  if (copiaPlantillas && copiaPlantillas.hasta > Date.now()) return copiaPlantillas.datos;
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID.");
  const r = await llamar(`${waba}/message_templates?fields=name,language,status,category,components&limit=100`);
  const datos = ((await r.json()) as { data?: PlantillaMeta[] }).data?.map(plantillaSoportada).filter((p): p is PlantillaCanal => !!p) ?? [];
  copiaPlantillas = { datos, hasta: Date.now() + 60_000 };
  return datos;
}

async function enviarPlantilla(to: string, t: NonNullable<OutboundMessage["template"]>) {
  return enviarA({
    to: to.replace(/\D/g, ""),
    type: "template",
    template: { name: t.nombre, language: { code: t.idioma }, ...(t.parametros.length ? { components: [{ type: "body", parameters: t.parametros.map((text) => ({ type: "text", text })) }] } : {}) },
  });
}

async function enviar(to: string, m: OutboundMessage) {
  if (m.type === "template") {
    if (!m.template) throw new Error("Falta la plantilla.");
    return enviarPlantilla(to, m.template);
  }
  const destino = { to: to.replace(/\D/g, "") }; // WhatsApp pide el número con código de país y sin "+"
  // Un documento (la guía en PDF) se sube igual que una imagen y se manda por su id, con el nombre que verá el cliente.
  if (m.type === "document") {
    const medio = m.mediaUrl ? await imagenParaEnviar(m.mediaUrl, true) : null;
    if (!medio) throw new Error("No se encontró el documento.");
    return enviarA({ ...destino, type: "document", document: { ...medio, filename: m.filename ?? "documento.pdf", ...(m.text ? { caption: m.text } : {}) } });
  }
  let texto = m.text;
  let imagen = m.type === "image" ? m.mediaUrl : undefined;
  if (m.type === "product") {
    if (!m.productId) throw new Error("Falta el producto.");
    const t = await leyendaDeProducto(m.productId);
    texto = t.texto;
    imagen = t.imagen ?? undefined;
  }
  const medio = imagen ? await imagenParaEnviar(imagen) : null;
  if (medio) return enviarA({ ...destino, type: "image", image: { ...medio, ...(texto ? { caption: texto } : {}) } });
  if (!texto) throw new Error("No hay nada que enviar.");
  return enviarA({ ...destino, type: "text", text: { body: texto, preview_url: false } });
}

/* ── Entrada ── */
type Contenido = {
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string }; image?: { id: string; caption?: string } }[];
  statuses?: { id: string; status: string; timestamp: string }[];
  metadata?: { phone_number_id?: string };
};
const fecha = (segundos: string) => new Date(Number(segundos) * 1000);
const ESTADOS: Record<string, StatusUpdate["status"]> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallo" };

/** Descarga una imagen entrante (GET /<id> da una URL temporal; esa URL se pide con el token) y la guarda. null si no se pudo. */
async function guardarImagenEntrante(mediaId: string): Promise<string | null> {
  try {
    const meta = (await (await llamar(mediaId)).json()) as { url?: string };
    if (!meta.url) return null;
    const datos = Buffer.from(await (await llamar(meta.url)).arrayBuffer());
    const ext = extensionDeImagen(datos);
    return ext ? (await almacenamiento.guardar(datos, ext)).url : null;
  } catch {
    return null;
  }
}

export async function interpretarEntrada(cuerpo: unknown): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[] }> {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const entradas = (cuerpo as { entry?: { changes?: { field?: string; value?: Contenido }[] }[] })?.entry ?? [];
  for (const cambio of entradas.flatMap((e) => e.changes ?? [])) {
    const v = cambio.value;
    if (cambio.field !== "messages" || !v) continue;
    if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue; // es de otro número
    for (const s of v.statuses ?? []) {
      const status = ESTADOS[s.status];
      if (status) statuses.push({ externalMessageId: s.id, status, timestamp: fecha(s.timestamp) });
    }
    for (const m of v.messages ?? []) {
      const base = {
        channel: "whatsapp" as const,
        externalContactId: `+${m.from}`,
        contactName: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
        externalMessageId: m.id,
        timestamp: fecha(m.timestamp),
      };
      if (m.type === "text" && m.text) messages.push({ ...base, type: "text", text: m.text.body });
      else if (m.type === "image" && m.image) {
        const mediaUrl = await guardarImagenEntrante(m.image.id);
        messages.push(mediaUrl ? { ...base, type: "image", text: m.image.caption, mediaUrl } : { ...base, type: "unsupported", text: m.image.caption });
      } else messages.push({ ...base, type: "unsupported" });
    }
  }
  return { messages, statuses };
}

export const adaptadorWhatsApp: ChannelAdapter = {
  channel: "whatsapp",
  send: enviar,
  enviaDocumentos: true,
  listTemplates: plantillas,
  verifySubscription: verificarSuscripcion,
  canSendFreeForm: (conversacion) => ventanaAbierta(conversacion.lastInboundAt),
  parseWebhook: async (req) => interpretarEntrada(await req.json()),
  async verifyWebhook(req) {
    const secreto = process.env.WHATSAPP_APP_SECRET;
    return !!secreto && firmaValida(await req.text(), req.headers.get("x-hub-signature-256"), secreto);
  },
};
