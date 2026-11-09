import { log } from "@/lib/ajustes";
import { almacenamiento, revisarGuia, type ArchivoDeGuia } from "@/lib/almacenamiento";
import { adaptador } from "@/lib/canales";
import { db } from "@/lib/db";
import { enviarMensaje } from "@/lib/mensajeria";
import { obtenerAjustesPedidos } from "./ajustes";
import { puedeCancelarPedido, puedeSobrePedido, type ActorPedido } from "@/lib/permisos";
import type { EstadoPedido } from "@/generated/prisma/client";
import { avisarCliente, type ResultadoAviso } from "./avisos";
import { ETIQUETA_ESTADO, transicionValida } from "./estados";
import { cambiarEstado } from "./flujo";
import { lineaDeSistema } from "./pedidos";
import { veTodo } from "@/lib/permisos";

type Actor = ActorPedido & { nombre: string };
type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** Lo que una persona puede pedir a mano. Los pasos de pago (en revisión, pagado) salen de verificar los comprobantes. */
const MANUALES: readonly EstadoPedido[] = ["preparando", "listo_para_recoger", "enviado", "entregado", "cancelado", "pendiente_pago"];
const AVISA: Partial<Record<EstadoPedido, "listo_para_recoger" | "enviado">> = { listo_para_recoger: "listo_para_recoger", enviado: "enviado" };

/** Lo que se guarda en el pedido al marcarlo como enviado (ya validado por `marcarEnviado`). */
type DatosEnvio = { nota: string; datos: { paqueteria: string | null; guia: string | null; guiaArchivoUrl: string | null; guiaArchivoNombre: string | null } };

/**
 * Pasa el pedido a otro estado desde el detalle: preparando, listo, entregado, cancelar o reactivar uno vencido. «Enviado» solo
 * llega por `marcarEnviado`, que valida la paquetería, la guía y el archivo: sin eso se rechaza (nadie lo salta por otro camino).
 */
export async function avanzarPedido(pedidoId: string, a: EstadoPedido, actor: Actor, o: { sobrePedido?: boolean; envio?: DatosEnvio } = {}): Promise<{ ok: true; aviso?: ResultadoAviso } | Fallo> {
  if (!MANUALES.includes(a)) return fallo("Ese cambio se hace verificando los comprobantes de pago.");
  if (a === "enviado" && !o.envio) return fallo("Indique cómo sale el pedido: entrega propia o paquetería, con su guía.");
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, creadoPorId: true, codigo: true, conversacionId: true, pagos: { where: { estado: "verificado" }, select: { id: true } } } });
  if (!p) return fallo("El pedido no existe.");
  if (a === "pendiente_pago" && p.estado !== "vencido") return fallo("Solo se reactiva un pedido vencido.");
  if (a === "cancelado" && !puedeCancelarPedido(actor, p, p.pagos.length > 0)) return fallo(veTodo(actor) ? "No se puede cancelar este pedido." : "Solo puede cancelar los pedidos que creó y que todavía no tienen un pago verificado.");
  if (o.sobrePedido && !puedeSobrePedido(actor)) return fallo("Solo un administrador o un jefe de tienda puede apartar «sobre pedido».");

  const r = await cambiarEstado({ pedidoId, a, quien: { usuarioId: actor.id }, sobrePedido: a === "pendiente_pago" ? !!o.sobrePedido : undefined, nota: a === "enviado" ? o.envio?.nota : undefined });
  if (!r.ok) return r;
  // Antes del aviso: el mensaje al cliente lleva la paquetería y el número de guía.
  if (a === "enviado" && o.envio) await db.order.update({ where: { id: pedidoId }, data: o.envio.datos });
  await log(actor, a === "cancelado" ? "cancelar_pedido" : "estado_pedido", "Order", pedidoId, { codigo: p.codigo, de: p.estado, a });
  if (p.conversacionId) await lineaDeSistema(actor, p.conversacionId, `${actor.nombre} pasó el pedido ${p.codigo} a «${ETIQUETA_ESTADO[a].toLowerCase()}»`);
  const clave = AVISA[a];
  return { ok: true, aviso: clave ? await avisarCliente(pedidoId, clave, { usuarioId: actor.id }) : undefined };
}

/** Cómo sale el pedido. `paqueteria` vacía = entrega propia. `archivo` es lo que llegó en el formulario (un File, o nada). */
export type EnvioPedido = { paqueteria: string | null; guia: string; archivo: unknown };
/** La guía adjunta: si salió por el chat o hay que mandarla a mano (canal cerrado, sin conexión o que no acepta PDF). */
export type ResultadoGuia = { estado: "enviada" | "manual"; url: string; nombre: string };

/**
 * Marca el pedido como enviado. Por paquetería exige el número de guía y la guía adjunta (foto o PDF; la nueva o la que ya
 * tenía); en una entrega propia no lleva ni guía ni archivo. Todo se valida antes de guardar el archivo, y el archivo solo se
 * guarda si el pedido de verdad puede pasar a «enviado». Al cliente le llega el aviso con la guía y, después, el archivo.
 */
export async function marcarEnviado(pedidoId: string, actor: Actor, e: EnvioPedido): Promise<{ ok: true; aviso?: ResultadoAviso; guia?: ResultadoGuia } | Fallo> {
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, entrega: true, conversacionId: true, guiaArchivoUrl: true, guiaArchivoNombre: true } });
  if (!p) return fallo("El pedido no existe.");
  if (p.entrega !== "envio") return fallo("Solo un pedido con envío se marca como enviado.");
  if (!transicionValida(p.estado, "enviado", p.entrega)) return fallo(`Un pedido ${ETIQUETA_ESTADO[p.estado].toLowerCase()} no puede pasar a enviado.`);

  const paqueteria = e.paqueteria?.trim() || null;
  let guia: string | null = null;
  let nuevo: ArchivoDeGuia | null = null;
  if (paqueteria) {
    if (!(await obtenerAjustesPedidos()).paqueterias.includes(paqueteria)) return fallo("Esa paquetería no está en la lista de Ajustes → Pagos y envíos.");
    guia = e.guia.trim();
    if (!guia) return fallo("Escriba el número de guía de la paquetería.");
    if (guia.length > 60) return fallo("La guía pasa de 60 caracteres.");
    if (e.archivo instanceof File && e.archivo.size > 0) {
      const r = await revisarGuia(e.archivo);
      if (!r.ok) return r;
      nuevo = r.archivo;
    } else if (!p.guiaArchivoUrl) return fallo("Adjunte la guía de la paquetería (foto o PDF).");
  }

  const url = nuevo ? (await almacenamiento.guardar(nuevo.datos, nuevo.ext)).url : paqueteria ? p.guiaArchivoUrl : null;
  const nombre = nuevo ? nuevo.nombre : paqueteria ? p.guiaArchivoNombre : null;
  // El historial del pedido guarda quién lo marcó y cuándo; la nota dice por dónde salió y si se adjuntó una guía nueva.
  const nota = paqueteria ? `Por ${paqueteria} · guía ${guia}${nuevo ? ` · guía adjunta: ${nuevo.nombre}` : ""}` : "Entrega propia";
  const r = await avanzarPedido(pedidoId, "enviado", actor, { envio: { nota, datos: { paqueteria, guia, guiaArchivoUrl: url, guiaArchivoNombre: nombre } } });
  if (!r.ok || !url || !nombre) return r;
  if (r.aviso?.estado === "apagado") return r; // el administrador apagó el aviso de envío: tampoco sale el archivo
  const estado = r.aviso?.estado === "enviado" && p.conversacionId ? await enviarGuia(pedidoId, p.conversacionId, url, nombre, actor.id) : "manual";
  return { ...r, guia: { estado, url, nombre } };
}

/** El archivo de la guía por el chat, después del aviso. Un PDF solo va por los canales que mandan documentos (hoy, WhatsApp). */
async function enviarGuia(pedidoId: string, conversacionId: string, url: string, nombre: string, usuarioId: string): Promise<"enviada" | "manual"> {
  const conv = await db.conversation.findUnique({ where: { id: conversacionId }, select: { canal: true } });
  const canal = conv ? adaptador(conv.canal) : null;
  const pdf = url.endsWith(".pdf");
  if (!canal || (pdf && !canal.enviaDocumentos)) return "manual";
  const r = await enviarMensaje({ conversacionId, usuarioId, autor: "asesor", aviso: true, pedidoId, mensaje: pdf ? { type: "document", mediaUrl: url, filename: nombre } : { type: "image", mediaUrl: url } });
  return r.ok ? "enviada" : "manual";
}

/** Guarda o corrige el número de guía mientras el pedido no se haya entregado. */
export async function guardarGuia(pedidoId: string, guia: string, actor: Actor): Promise<{ ok: true } | Fallo> {
  const g = guia.trim();
  if (g.length > 60) return fallo("La guía pasa de 60 caracteres.");
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, codigo: true, entrega: true } });
  if (!p) return fallo("El pedido no existe.");
  if (p.entrega !== "envio") return fallo("Solo los pedidos con envío llevan guía.");
  if (!["pagado", "preparando", "enviado"].includes(p.estado)) return fallo("La guía se escribe cuando el pedido ya está pagado y todavía no se entregó.");
  await db.order.update({ where: { id: pedidoId }, data: { guia: g || null } });
  await log(actor, "guia_pedido", "Order", pedidoId, { codigo: p.codigo, guia: g });
  return { ok: true };
}
