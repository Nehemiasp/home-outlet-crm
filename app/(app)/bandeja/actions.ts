"use server";

import { z } from "zod";
import { MAX_BYTES, almacenamiento, extensionDeImagen } from "@/lib/almacenamiento";
import { cargarConversacion, listarConversaciones } from "@/lib/bandeja";
import type { AsesorMini, ContadoresLista, ConversacionDTO, Filtros, ItemLista, ProductoDTO } from "@/lib/bandeja-tipos";
import { adaptador } from "@/lib/canales";
import { armarCuerpo } from "@/lib/canales/plantillas-canal";
import { CANALES, type PlantillaCanal } from "@/lib/canales/tipos";
import { db } from "@/lib/db";
import { devolverAlAsistente, pausarAsistente } from "@/lib/ia/atencion";
import { resumirConversacion, sugerirRespuesta } from "@/lib/ia/ayudas";
import { MOTIVOS } from "@/lib/ia/tipos";
import { enviarMensaje, reintentarMensaje, type ResultadoEnvio } from "@/lib/mensajeria";
import { puedeAsignar, puedeCerrar } from "@/lib/permisos";
import { vencerReservas } from "@/lib/pedidos/vencimiento";
import { requireUsuario } from "@/lib/session";
import { puedeVerConversacion, puedeVerMensaje } from "@/lib/visibilidad";
import { listarAsesores } from "@/lib/equipo/asesores";
import { devolverACola } from "@/lib/equipo/gestion";

type Resultado = { ok: true } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
// Lo que la persona no puede ver responde igual que lo que no existe.
const NO_EXISTE = fallo("La conversación no existe.");
const ve = async (u: { id: string; rol: "admin" | "agente" }, conversacionId: string) => puedeVerConversacion(u, id.parse(conversacionId));

const filtros = z.object({
  tab: z.enum(["sin-asignar", "mias", "todas"]),
  atencion: z.enum(["todas", "asistente", "esperando"]),
  estado: z.enum(["todos", "abierta", "pendiente", "cerrada"]),
  canal: z.enum(["todos", ...CANALES]),
  asesor: z.string().max(40),
  q: z.string().max(100),
  limite: z.number().int().min(1).max(300),
});
const id = z.string().min(1).max(40);
const texto = z.string().trim().min(1, "Escriba un mensaje.").max(4000, "El mensaje es demasiado largo.");

/* ── Lectura ── */
export async function listar(f: Filtros): Promise<{ items: ItemLista[]; hayMas: boolean; contadores: ContadoresLista; asesores: AsesorMini[] }> {
  const u = await requireUsuario();
  await vencerReservas(); // barata y limitada a una vez cada 30 s: así las reservas vencen aunque nadie abra Pedidos
  const r = await listarConversaciones(filtros.parse(f), u);
  return { ...r, asesores: u.rol === "admin" ? await listarAsesores() : [] };
}

export async function obtener(conversacionId: string): Promise<ConversacionDTO | null> {
  const u = await requireUsuario();
  return cargarConversacion(id.parse(conversacionId), u);
}

export async function buscarProductos(q: string): Promise<ProductoDTO[]> {
  await requireUsuario();
  const busca = z.string().trim().max(60).parse(q);
  const filas = await db.product.findMany({
    where: { activo: true, ...(busca ? { OR: [{ nombre: { contains: busca, mode: "insensitive" } }, { sku: { contains: busca, mode: "insensitive" } }] } : {}) },
    orderBy: { nombre: "asc" },
    take: 12,
    include: { stock: true },
  });
  return filas.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, precioCentavos: p.precio, existencia: p.stock.reduce((s, x) => s + x.cantidad, 0), imagenUrl: p.imagenes[0] }));
}

/* ── Enviar ── */
export async function enviarTexto(conversacionId: string, t: string): Promise<ResultadoEnvio> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const p = texto.safeParse(t);
  if (!p.success) return fallo(p.error.issues[0]!.message);
  return enviarMensaje({ conversacionId: id.parse(conversacionId), usuarioId: u.id, mensaje: { type: "text", text: p.data } });
}

export async function enviarProducto(conversacionId: string, productoId: string): Promise<ResultadoEnvio> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const producto = await db.product.findFirst({ where: { id: id.parse(productoId), activo: true }, select: { id: true } });
  if (!producto) return fallo("El producto ya no está disponible.");
  return enviarMensaje({ conversacionId: id.parse(conversacionId), usuarioId: u.id, mensaje: { type: "product", productId: producto.id } });
}

export async function enviarImagen(conversacionId: string, datos: FormData): Promise<ResultadoEnvio> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("Elija una imagen.");
  if (archivo.size > MAX_BYTES) return fallo("La imagen pesa más de 5 MB. Elija una más liviana.");
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = extensionDeImagen(buffer);
  if (!ext) return fallo("Solo se aceptan imágenes JPG, PNG o WebP.");
  const { url } = await almacenamiento.guardar(buffer, ext);
  return enviarMensaje({ conversacionId: id.parse(conversacionId), usuarioId: u.id, mensaje: { type: "image", mediaUrl: url } });
}

/** Plantillas aprobadas del canal de la conversación (las únicas que se pueden enviar con la ventana de 24 horas cerrada). */
export async function plantillas(conversacionId: string): Promise<{ ok: true; plantillas: PlantillaCanal[] } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const conv = await db.conversation.findUnique({ where: { id: id.parse(conversacionId) }, select: { canal: true } });
  const canal = conv && adaptador(conv.canal);
  if (!canal?.listTemplates) return fallo("Este canal no tiene plantillas.");
  try {
    return { ok: true, plantillas: await canal.listTemplates() };
  } catch {
    return fallo("No se pudieron cargar las plantillas. Revise la conexión del canal.");
  }
}

const datosPlantilla = z.object({ nombre: z.string().min(1).max(200), idioma: z.string().min(1).max(20), parametros: z.array(z.string().max(1000)).max(10) });

/** Envía una plantilla aprobada. El texto lo arma el servidor con la plantilla que devuelve el canal, no el que mande el navegador. */
export async function enviarPlantilla(conversacionId: string, nombre: string, idioma: string, parametros: string[]): Promise<ResultadoEnvio> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const p = datosPlantilla.safeParse({ nombre, idioma, parametros });
  if (!p.success) return fallo("Revise los datos de la plantilla.");
  const lista = await plantillas(conversacionId);
  if (!lista.ok) return lista;
  const elegida = lista.plantillas.find((x) => x.nombre === p.data.nombre && x.idioma === p.data.idioma);
  if (!elegida) return fallo("Esa plantilla ya no está disponible.");
  if (p.data.parametros.length !== elegida.variables || p.data.parametros.some((v) => !v.trim())) return fallo("Complete todos los campos de la plantilla.");
  const limpios = p.data.parametros.map((v) => v.replace(/\s+/g, " ").trim()); // WhatsApp no admite saltos de línea ni más de 4 espacios seguidos en una variable
  return enviarMensaje({
    conversacionId: id.parse(conversacionId),
    usuarioId: u.id,
    mensaje: { type: "template", text: armarCuerpo(elegida.cuerpo, limpios), template: { nombre: elegida.nombre, idioma: elegida.idioma, parametros: limpios } },
  });
}

export async function reintentar(mensajeId: string): Promise<ResultadoEnvio> {
  const u = await requireUsuario();
  if (!(await puedeVerMensaje(u, id.parse(mensajeId)))) return fallo("Este mensaje no se puede reintentar.");
  return reintentarMensaje(id.parse(mensajeId));
}

export async function guardarNota(conversacionId: string, t: string): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const p = texto.safeParse(t);
  if (!p.success) return fallo(p.error.issues[0]!.message);
  const conv = await db.conversation.findUnique({ where: { id: id.parse(conversacionId) }, select: { id: true } });
  if (!conv) return NO_EXISTE;
  await db.note.create({ data: { conversacionId: conv.id, autorId: u.id, texto: p.data } });
  return { ok: true };
}

/* ── Gestión de la conversación ── */
export async function asignar(conversacionId: string, destinoId: string | null): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const conv = await db.conversation.findUnique({ where: { id: id.parse(conversacionId) }, select: { id: true, asignadaAId: true } });
  if (!conv) return NO_EXISTE;
  if (!puedeAsignar(u, conv, destinoId)) return fallo("No tiene permiso para asignar esta conversación.");
  const destino = destinoId ? await db.user.findFirst({ where: { id: destinoId, activo: true }, select: { id: true, nombre: true } }) : null;
  if (destinoId && !destino) return fallo("El usuario no existe o está desactivado.");
  const anterior = conv.asignadaAId && conv.asignadaAId !== destino?.id ? await db.user.findUnique({ where: { id: conv.asignadaAId }, select: { nombre: true } }) : null;

  await db.$transaction([
    // Con asesor asignado, el asistente deja de responder; sin asignación, la conversación queda esperando a alguien.
    db.conversation.update({ where: { id: conv.id }, data: destino ? { asignadaAId: destino.id, atendidaPor: "asesor", esperandoAsesorDesde: null } : { asignadaAId: null, atendidaPor: "nadie", esperandoAsesorDesde: new Date() } }),
    db.activityLog.create({ data: { usuarioId: u.id, accion: "asignar", entidad: "Conversation", entidadId: conv.id, detalle: { a: destino?.nombre ?? null, por: u.nombre, ...(destino && anterior ? { tipo: "reasignar", de: anterior.nombre } : {}) } } }),
  ]);
  return { ok: true };
}

/** El asesor devuelve una conversación suya a la cola, con un motivo opcional; se vuelve a repartir sin volver a caer en él. */
export async function devolverCola(conversacionId: string, motivo: string): Promise<{ ok: true; asignadaA: string | null } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  return devolverACola(id.parse(conversacionId), u, z.string().max(200).parse(motivo));
}

export async function cambiarEstado(conversacionId: string, estado: string): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const nuevo = z.enum(["abierta", "pendiente", "cerrada"]).parse(estado);
  const conv = await db.conversation.findUnique({ where: { id: id.parse(conversacionId) }, select: { id: true, asignadaAId: true, estado: true } });
  if (!conv) return fallo("La conversación no existe.");
  if (conv.estado === nuevo) return { ok: true };
  if (nuevo === "cerrada" && !puedeCerrar(u, conv)) return fallo("Solo puede cerrar las conversaciones que tiene asignadas.");

  await db.$transaction([
    db.conversation.update({ where: { id: conv.id }, data: { estado: nuevo, ...(nuevo === "cerrada" ? { esperandoAsesorDesde: null } : {}) } }),
    db.activityLog.create({ data: { usuarioId: u.id, accion: "estado", entidad: "Conversation", entidadId: conv.id, detalle: { estado: nuevo, por: u.nombre } } }),
  ]);
  return { ok: true };
}

/* ── Asistente y ayudas para el agente ── */
const existe = async (conversacionId: string) => !!(await db.conversation.findUnique({ where: { id: conversacionId }, select: { id: true } }));

/** El interruptor "Asistente activo en esta conversación". Encendido lo devuelve al asistente; apagado lo pausa. */
export async function alternarAsistente(conversacionId: string, activo: boolean): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId)) || !(await existe(id.parse(conversacionId)))) return NO_EXISTE;
  await (activo ? devolverAlAsistente(conversacionId, u) : pausarAsistente(conversacionId, u));
  return { ok: true };
}

export async function sugerir(conversacionId: string): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  return sugerirRespuesta(id.parse(conversacionId));
}

export async function resumir(conversacionId: string): Promise<{ ok: true; texto: string; creado: string } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const r = await resumirConversacion(id.parse(conversacionId), u.id);
  return r.ok ? { ok: true, texto: r.texto, creado: r.creado.toISOString() } : r;
}

export async function cambiarMotivo(conversacionId: string, motivo: string): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await ve(u, conversacionId))) return NO_EXISTE;
  const m = z.enum(MOTIVOS).safeParse(motivo);
  if (!m.success) return fallo("Elija uno de los motivos de la lista.");
  await db.conversation.update({ where: { id: id.parse(conversacionId) }, data: { motivo: m.data } });
  return { ok: true };
}
