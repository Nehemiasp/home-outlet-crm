import { randomUUID } from "node:crypto";
import { aplicarEstado } from "@/lib/estado-entrega";
import { adaptador } from "./index";
import { firmarTikTok, TIKTOK_MAX_SALIENTES } from "./tiktok";
import type { InboundMessage } from "./tipos";

/**
 * TikTok SIMULADO, solo para desarrollo: hace de la API de TikTok dentro del mismo servidor, para ver el canal completo sin la
 * cuenta real. Se enciende con TIKTOK_API_URL=http://localhost:3000/api/simulador/tiktok y credenciales inventadas
 * (ver .env.example). En producción no existe (la ruta responde 404 y el arranque rechaza esa dirección).
 *
 * Hace tres cosas, igual que haría TikTok:
 *  - Recibe los envíos del sistema (POST business/message/send/ y …/media/upload/), con el Access-Token, y aplica las reglas de TikTok:
 *    solo se responde dentro de las 48 horas desde el último mensaje del cliente y hasta 10 mensajes seguidos sin que vuelva a escribir.
 *  - Convierte lo que escribe el «cliente» (pantalla Simulador) en un aviso FIRMADO con el formato del webhook, que pasa por la misma
 *    verificación de firma y lectura que pasaría uno real.
 *  - Unos segundos después de cada envío avisa que el cliente lo leyó (im_mark_read_msg).
 */

type Estado = { ultimoEntrante: number; enviados: number };
// Un solo mapa para todo el proceso: la ruta de la API y las acciones del simulador pueden cargarse por separado.
const g = globalThis as typeof globalThis & { __tiktokSim?: Map<string, Estado> };
const estados = () => (g.__tiktokSim ??= new Map());

const respuesta = (code: number, message: string, status: number, data?: object) => Response.json({ code, message, request_id: randomUUID(), ...(data ? { data } : {}) }, { status });

/** Esta es la API de TikTok: recibe lo que el sistema envía. `ruta` va sin barra al final, p. ej. «business/message/send». */
export async function apiSimulada(ruta: string, req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  if (!process.env.TIKTOK_ACCESS_TOKEN || req.headers.get("access-token") !== process.env.TIKTOK_ACCESS_TOKEN) return respuesta(40105, "Access-Token inválido", 401);
  const negocio = process.env.TIKTOK_BUSINESS_ID;

  if (ruta === "business/message/media/upload") {
    const f = await req.formData().catch(() => null);
    const archivo = f?.get("file");
    if (!f || f.get("business_id") !== negocio || f.get("media_type") !== "IMAGE" || !(archivo instanceof Blob) || archivo.size === 0) return respuesta(40002, "Datos inválidos", 400);
    return respuesta(0, "OK", 200, { media_id: `sim-media-${randomUUID()}` });
  }

  if (ruta === "business/message/send") {
    const b = (await req.json().catch(() => null)) as { business_id?: string; recipient?: string; message_type?: string; text?: { body?: string }; image?: { media_id?: string } } | null;
    const valido = b && b.business_id === negocio && typeof b.recipient === "string" && b.recipient && (b.message_type === "TEXT" ? !!b.text?.body : b.message_type === "IMAGE" ? !!b.image?.media_id : false);
    if (!valido) return respuesta(40002, "Datos inválidos", 400);
    // Un usuario que esta simulación nunca vio (por ejemplo, tras reiniciar el servidor) se deja pasar: solo se vigila lo que se sabe.
    const e = estados().get(b.recipient!);
    if (e && Date.now() - e.ultimoEntrante > 48 * 3600_000) return respuesta(40010, "Pasaron más de 48 horas desde el último mensaje del usuario", 400);
    if (e && e.enviados >= TIKTOK_MAX_SALIENTES) return respuesta(40011, "Se alcanzó el máximo de mensajes sin respuesta del usuario", 400);
    if (e) e.enviados++;
    const id = `sim-tt-out-${randomUUID()}`;
    leidoDespues(id);
    return respuesta(0, "OK", 200, { message_id: id });
  }
  return respuesta(40004, "Ruta desconocida", 404);
}

/** Pasa un aviso (como el webhook) por el adaptador real: firma incluida. */
async function entregar(evento: object) {
  const adp = adaptador("tiktok");
  if (!adp) throw new Error("El canal de TikTok no está activo (revise CHANNELS_ENABLED y las variables TIKTOK_*).");
  const cuerpo = JSON.stringify(evento);
  const pedir = () => new Request("http://localhost/api/webhooks/tiktok", { method: "POST", body: cuerpo, headers: { "tiktok-signature": firmarTikTok(cuerpo, process.env.TIKTOK_APP_SECRET ?? "") } });
  if (!(await adp.verifyWebhook(pedir()))) throw new Error("La firma del aviso simulado no es válida.");
  return adp.parseWebhook(pedir());
}

const aviso = (event: string, contenido: object) => ({ event, business_id: process.env.TIKTOK_BUSINESS_ID, timestamp: Math.floor(Date.now() / 1000), content: JSON.stringify(contenido) });

function leidoDespues(messageId: string) {
  setTimeout(() => {
    void entregar(aviso("im_mark_read_msg", { target_message_id: messageId }))
      .then(async (r) => {
        for (const s of r.statuses) await aplicarEstado(s);
      })
      .catch(() => {});
  }, 2500).unref?.();
}

/** Lo que escribe el cliente en TikTok, ya leído por el sistema (listo para `recibirMensaje`). Una imagen y un texto salen como dos mensajes. */
export async function entradaSimulada(p: { usuarioId: string; nombre?: string; texto?: string; imagen?: { tipo: string; datos: Buffer } }): Promise<InboundMessage[]> {
  const de = { id: p.usuarioId, display_name: p.nombre };
  const mensajes: InboundMessage[] = [];
  const base = { from_user: de, to_user: { id: process.env.TIKTOK_BUSINESS_ID } };
  if (p.imagen) mensajes.push(...(await entregar(aviso("im_receive_msg", { ...base, message_id: `sim-tt-in-${randomUUID()}`, message_type: "image", image: { url: `data:${p.imagen.tipo};base64,${p.imagen.datos.toString("base64")}` } }))).messages);
  if (p.texto) mensajes.push(...(await entregar(aviso("im_receive_msg", { ...base, message_id: `sim-tt-in-${randomUUID()}`, message_type: "text", text: { body: p.texto } }))).messages);
  const e = estados().get(p.usuarioId);
  if (e) Object.assign(e, { ultimoEntrante: Date.now(), enviados: 0 });
  else estados().set(p.usuarioId, { ultimoEntrante: Date.now(), enviados: 0 });
  return mensajes;
}
