"use server";

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { procesarMensajeEntrante } from "@/lib/ia/atencion";
import { z } from "zod";
import type { ProductoTarjeta } from "@/components/ui/conversacion";
import { adaptador } from "@/lib/canales";
import { entradaSimulada } from "@/lib/canales/tiktok-simulado";
import { CANALES, type Channel } from "@/lib/canales/tipos";
import { db } from "@/lib/db";
import { almacenamiento, guardarImagenSubida, TIPOS } from "@/lib/almacenamiento";
import { recibirMensaje } from "@/lib/mensajeria";
import { disponibleProducto } from "@/lib/pedidos/existencias";
import { requireUsuario } from "@/lib/session";
import { normalizarTelefono } from "@/lib/telefono";

async function soloAdminEnDesarrollo() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUsuario("admin");
}

const canal = z.enum(CANALES);
const conTelefono = (c: Channel) => c === "whatsapp" || c === "simulado";

export type MensajeChat = { id: string; deCliente: boolean; texto: string; fecha: string; producto?: ProductoTarjeta; imagenUrl?: string };
export type ContactoSim = { id: string; nombre: string; telefono: string | null };

const entradaEnvio = z.object({
  contactoId: z.string().nullable(),
  nombre: z.string().trim().max(80).optional(),
  telefono: z.string().trim().max(30).optional(),
  canal,
  texto: z.string().trim().max(1000).default(""),
  /** Imagen que ya se subió con subirImagenSim (por ejemplo, un comprobante de pago). */
  imagenUrl: z.string().regex(/^\/api\/archivos\/[0-9a-f-]{36}\.(jpg|png|webp)$/).optional(),
}).refine((e) => e.texto || e.imagenUrl, { message: "Escriba un mensaje.", path: ["texto"] });

export async function enviarComoCliente(entrada: z.input<typeof entradaEnvio>): Promise<{ ok: true; contacto: ContactoSim } | { ok: false; error: string }> {
  await soloAdminEnDesarrollo();
  const p = entradaEnvio.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Revise los datos." };
  const { contactoId, nombre, telefono, canal: c, texto, imagenUrl } = p.data;

  let externalContactId: string;
  let contactName: string | undefined;

  if (contactoId) {
    const contacto = await db.contact.findUnique({ where: { id: contactoId } });
    if (!contacto) return { ok: false, error: "El contacto no existe." };
    const identidad = await db.channelIdentity.findFirst({ where: { contactoId, canal: c } });
    externalContactId = identidad?.externalContactId ?? (conTelefono(c) && contacto.telefono ? contacto.telefono : `${c}_sim_${contacto.id}`);
    if (!identidad) await db.channelIdentity.create({ data: { contactoId, canal: c, externalContactId } });
  } else {
    if (!nombre) return { ok: false, error: "Escriba el nombre del contacto nuevo." };
    const tel = telefono ? normalizarTelefono(telefono) : null;
    if (telefono && !tel) return { ok: false, error: "El teléfono no es válido. Use 8 dígitos, por ejemplo 5555 1234." };
    if (conTelefono(c) && !tel) return { ok: false, error: "Este canal necesita el teléfono del contacto." };
    externalContactId = conTelefono(c) ? tel! : `${c}_sim_${randomUUID()}`;
    contactName = nombre;
  }

  let recibido: { conversacionId?: string } = {};
  if (c === "tiktok" && adaptador("tiktok")) {
    // Con TikTok activo, el mensaje entra como entraría el de TikTok: un aviso firmado que el adaptador verifica y lee.
    const nombreArchivo = imagenUrl?.replace("/api/archivos/", "");
    const datos = nombreArchivo ? await almacenamiento.leer(nombreArchivo) : null;
    const mensajes = await entradaSimulada({ usuarioId: externalContactId, nombre: contactName, texto: texto || undefined, imagen: datos && nombreArchivo ? { tipo: TIPOS[nombreArchivo.split(".").pop()!]!, datos } : undefined });
    for (const m of mensajes) recibido = await recibirMensaje(m);
  } else {
    recibido = await recibirMensaje({ channel: c, externalContactId, contactName, externalMessageId: `sim-in-${randomUUID()}`, ...(imagenUrl ? { type: "image" as const, mediaUrl: imagenUrl, text: texto || undefined } : { type: "text" as const, text: texto }), timestamp: new Date() });
  }
  // Responde el asistente (si le toca) después de contestarle a la pantalla, sin hacer esperar al cliente.
  if (recibido.conversacionId) after(() => procesarMensajeEntrante(recibido.conversacionId!));

  const identidad = await db.channelIdentity.findUnique({ where: { canal_externalContactId: { canal: c, externalContactId } }, include: { contacto: true } });
  if (!identidad) return { ok: false, error: "No se pudo guardar el mensaje." };
  const { id, nombre: n, telefono: t } = identidad.contacto;
  return { ok: true, contacto: { id, nombre: n, telefono: t } };
}

/** La conversación vista desde el teléfono del cliente: sus mensajes y las respuestas del equipo. */
export async function obtenerChat(contactoId: string, c: Channel): Promise<MensajeChat[]> {
  await soloAdminEnDesarrollo();
  const conv = await db.conversation.findFirst({ where: { contactoId, canal: canal.parse(c) }, orderBy: { lastMessageAt: "desc" } });
  if (!conv) return [];
  const mensajes = await db.message.findMany({ where: { conversacionId: conv.id }, orderBy: { fecha: "desc" }, take: 50, include: { producto: { include: { stock: true } } } });
  return mensajes.reverse().map((m) => ({
    id: m.id,
    deCliente: m.direccion === "entrante",
    texto: m.texto ?? (m.tipo === "image" ? "" : "[archivo]"),
    fecha: m.fecha.toISOString(),
    producto: m.producto
      ? { nombre: m.producto.nombre, sku: m.producto.sku, precioCentavos: m.producto.precio, existencia: disponibleProducto(m.producto.stock), imagenUrl: m.producto.imagenes[0] }
      : undefined,
    imagenUrl: m.tipo === "image" ? (m.archivoUrl ?? undefined) : undefined,
  }));
}

/** Sube la imagen que el "cliente" va a mandar. */
export async function subirImagenSim(datos: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await soloAdminEnDesarrollo();
  return guardarImagenSubida(datos.get("archivo"));
}

/** Sube el comprobante de ejemplo que viene con el proyecto, para probar el flujo de pagos sin buscar una foto. */
export async function subirComprobanteDeEjemplo(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await soloAdminEnDesarrollo();
  const { readFile } = await import("node:fs/promises");
  const { default: path } = await import("node:path");
  const datos = await readFile(path.join(process.cwd(), "public", "demo", "comprobante-demo.png")).catch(() => null);
  if (!datos) return { ok: false, error: "No se encontró el comprobante de ejemplo." };
  return { ok: true, url: (await almacenamiento.guardar(datos, "png")).url };
}
