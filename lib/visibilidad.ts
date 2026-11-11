import { db } from "@/lib/db";
import { obtenerAjustesEquipo } from "@/lib/equipo/ajustes";
import type { Prisma } from "@/generated/prisma/client";
import type { Rol } from "@/lib/permisos";

/**
 * Qué ve cada persona. Con «Los asesores ven solo sus conversaciones» activo, un asesor solo ve las conversaciones
 * asignadas a él y los contactos y pedidos ligados a ellas. Los administradores y los jefes de tienda ven todo.
 *
 * Esto se aplica en el servidor, en cada consulta y en cada acción que recibe un id: ocultar algo en la pantalla no basta.
 * Lo ajeno responde igual que lo que no existe (404 en las páginas, «no encontrada» en las acciones).
 */
export type Actor = { id: string; rol: Rol };

/** ¿Se le limita lo que ve? Solo a los asesores (rol «agente»), solo si el ajuste está activo, y nunca en la bandeja compartida (ahí todos ven todo). */
export async function restringido(u: Actor): Promise<boolean> {
  if (u.rol !== "agente") return false;
  const a = await obtenerAjustesEquipo();
  return a.asesoresVenSoloSuyas && a.modoAsignacion !== "compartida";
}

export async function filtroConversacion(u: Actor): Promise<Prisma.ConversationWhereInput> {
  return (await restringido(u)) ? { asignadaAId: u.id } : {};
}

/** Un contacto es visible si tiene una conversación asignada al asesor o si lo creó él (y todavía no tiene conversación). */
export async function filtroContacto(u: Actor): Promise<Prisma.ContactWhereInput> {
  return (await restringido(u)) ? { OR: [{ conversaciones: { some: { asignadaAId: u.id } } }, { creadoPorId: u.id }] } : {};
}

/** Un pedido es visible si su conversación está asignada al asesor. Un pedido sin conversación solo lo ven el administrador y el jefe de tienda. */
export async function filtroPedido(u: Actor): Promise<Prisma.OrderWhereInput> {
  return (await restringido(u)) ? { conversacion: { asignadaAId: u.id } } : {};
}

/** Una cotización se ve igual que un pedido: por la conversación asignada al asesor. */
export async function filtroCotizacion(u: Actor): Promise<Prisma.CotizacionWhereInput> {
  return (await restringido(u)) ? { conversacion: { asignadaAId: u.id } } : {};
}

export async function puedeVerConversacion(u: Actor, id: string) {
  return (await db.conversation.count({ where: { id, ...(await filtroConversacion(u)) } })) > 0;
}
export async function puedeVerContacto(u: Actor, id: string) {
  return (await db.contact.count({ where: { id, ...(await filtroContacto(u)) } })) > 0;
}
export async function puedeVerPedido(u: Actor, id: string) {
  return (await db.order.count({ where: { id, ...(await filtroPedido(u)) } })) > 0;
}
export async function puedeVerCotizacion(u: Actor, id: string) {
  return (await db.cotizacion.count({ where: { id, ...(await filtroCotizacion(u)) } })) > 0;
}
export async function puedeVerMensaje(u: Actor, id: string) {
  return (await db.message.count({ where: { id, conversacion: await filtroConversacion(u) } })) > 0;
}
export async function puedeVerPago(u: Actor, id: string) {
  return (await db.payment.count({ where: { id, pedido: await filtroPedido(u) } })) > 0;
}

/**
 * Los archivos subidos (fotos del chat, comprobantes y guías de paquetería) se sirven por su nombre: un asesor solo puede abrir los de
 * sus conversaciones y sus pedidos, o las fotos del catálogo, que son de todos.
 */
export async function puedeVerArchivo(u: Actor, nombre: string) {
  const url = `/api/archivos/${nombre}`;
  // Bodega solo ve las fotos del catálogo y las guías de paquetería de los pedidos en despacho (las sube ella):
  // nunca las fotos del chat ni los comprobantes de pago.
  if (u.rol === "bodega") {
    const [producto, guia] = await Promise.all([
      db.product.count({ where: { imagenes: { has: url } } }),
      db.order.count({ where: { guiaArchivoUrl: url, estado: { in: ["pagado", "preparando", "pendiente_envio", "listo_para_recoger", "enviado"] } } }),
    ]);
    return producto + guia > 0;
  }
  if (!(await restringido(u))) return true;
  const [mensaje, pago, producto, guia] = await Promise.all([
    db.message.count({ where: { archivoUrl: url, conversacion: await filtroConversacion(u) } }),
    db.payment.count({ where: { archivoUrl: url, pedido: await filtroPedido(u) } }),
    db.product.count({ where: { imagenes: { has: url } } }),
    db.order.count({ where: { guiaArchivoUrl: url, ...(await filtroPedido(u)) } }),
  ]);
  return mensaje + pago + producto + guia > 0;
}

/** Un pago duplicado en un pedido ajeno se avisa, pero sin decir cuál es ni dejar abrirlo. */
export type DuplicadoVisible = { pagoId: string; pedidoId: string | null; codigo: string | null; estado: string };

export async function redactarDuplicados<T extends { pagoId: string; pedidoId: string; codigo: string; estado: string }>(u: Actor, duplicados: T[]): Promise<DuplicadoVisible[]> {
  if (!(await restringido(u)) || duplicados.length === 0) return duplicados;
  const visibles = new Set((await db.order.findMany({ where: { id: { in: duplicados.map((d) => d.pedidoId) }, ...(await filtroPedido(u)) }, select: { id: true } })).map((o) => o.id));
  return duplicados.map((d) => (visibles.has(d.pedidoId) ? d : { pagoId: d.pagoId, pedidoId: null, codigo: null, estado: d.estado }));
}
