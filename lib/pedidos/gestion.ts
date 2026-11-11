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
import { saldoDe } from "./totales";
import { formatQ } from "@/lib/utils";
import { cambiarEstado } from "./flujo";
import { lineaDeSistema } from "./pedidos";
import { veTodo } from "@/lib/permisos";

type Actor = ActorPedido & { nombre: string };
type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** Lo que una persona puede pedir a mano. Los pasos de pago (en revisión, pagado) salen de verificar los comprobantes. */
const MANUALES: readonly EstadoPedido[] = ["preparando", "pendiente_envio", "listo_para_recoger", "enviado", "entregado", "cancelado", "pendiente_pago"];
const AVISA: Partial<Record<EstadoPedido, "listo_para_recoger" | "enviado">> = { listo_para_recoger: "listo_para_recoger", enviado: "enviado" };

/** Lo que se guarda en el pedido al pasarlo a pendiente de envío (la paquetería) o a enviado (la guía), ya validado. */
type DatosEnvio = { nota: string; datos: { paqueteria?: string | null; guia?: string | null; guiaArchivoUrl?: string | null; guiaArchivoNombre?: string | null } };

/**
 * Pasa el pedido a otro estado desde el detalle: preparando, listo, entregado, cancelar o reactivar uno vencido. «Pendiente de
 * envío» solo llega por `marcarPendienteEnvio` (valida la paquetería) y «enviado» solo por `marcarEnviado` (valida la guía y el
 * archivo): sin eso se rechazan (nadie los salta por otro camino).
 */
export async function avanzarPedido(pedidoId: string, a: EstadoPedido, actor: Actor, o: { sobrePedido?: boolean; envio?: DatosEnvio } = {}): Promise<{ ok: true; aviso?: ResultadoAviso } | Fallo> {
  if (!MANUALES.includes(a)) return fallo("Ese cambio se hace verificando los comprobantes de pago.");
  if (a === "pendiente_envio" && !o.envio) return fallo("Elija por dónde sale el pedido: una paquetería o entrega propia.");
  if (a === "enviado" && !o.envio) return fallo("Escriba la guía de la paquetería para marcar el pedido como enviado.");
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, creadoPorId: true, codigo: true, conversacionId: true, metodoPago: true, total: true, pagos: { where: { estado: "verificado" }, select: { id: true, monto: true } } } });
  if (!p) return fallo("El pedido no existe.");
  if (a === "pendiente_pago" && p.estado !== "vencido") return fallo("Solo se reactiva un pedido vencido.");
  if (a === "cancelado" && !puedeCancelarPedido(actor, p, p.pagos.length > 0)) return fallo(veTodo(actor) ? "No se puede cancelar este pedido." : "Solo puede cancelar los pedidos que creó y que todavía no tienen un pago verificado.");
  if (o.sobrePedido && !puedeSobrePedido(actor)) return fallo("Solo un administrador o un jefe de tienda puede apartar «sobre pedido».");

  const conEnvio = a === "enviado" || a === "pendiente_envio";
  const r = await cambiarEstado({ pedidoId, a, quien: { usuarioId: actor.id }, sobrePedido: a === "pendiente_pago" ? !!o.sobrePedido : undefined, nota: conEnvio ? o.envio?.nota : undefined });
  if (!r.ok) return r;
  // Antes del aviso: el mensaje al cliente lleva la paquetería y el número de guía.
  if (conEnvio && o.envio) await db.order.update({ where: { id: pedidoId }, data: o.envio.datos });
  await log(actor, a === "cancelado" ? "cancelar_pedido" : "estado_pedido", "Order", pedidoId, { codigo: p.codigo, de: p.estado, a });
  if (p.conversacionId) await lineaDeSistema(actor, p.conversacionId, `${actor.nombre} pasó el pedido ${p.codigo} a «${ETIQUETA_ESTADO[a].toLowerCase()}»`);
  // Pago contra entrega: entregarlo es cobrarlo. Queda el pago registrado y verificado por quien marcó la entrega.
  if (a === "entregado" && p.metodoPago === "contra_entrega") {
    const saldo = saldoDe(p.total, p.pagos.reduce((t, x) => t + x.monto, 0));
    if (saldo > 0) {
      const ahora = new Date();
      await db.payment.create({ data: { pedidoId, tipo: "contra_entrega", monto: saldo, fechaPago: ahora, estado: "verificado", verificadoPorId: actor.id, verificadoEn: ahora, registradoPorId: actor.id } });
      if (p.conversacionId) await lineaDeSistema(actor, p.conversacionId, `Cobro contra entrega de ${formatQ(saldo)} registrado al entregar el pedido ${p.codigo}`);
    }
  }
  const clave = AVISA[a];
  return { ok: true, aviso: clave ? await avisarCliente(pedidoId, clave, { usuarioId: actor.id }) : undefined };
}

/** La guía al marcarlo como enviado. `archivo` es lo que llegó en el formulario (un File, o nada). La paquetería ya está en el pedido. */
export type EnvioPedido = { guia: string; archivo: unknown };

/**
 * Pasa un pedido con envío (ya preparado) a «pendiente de envío». Exige elegir por dónde sale: una paquetería de la lista de
 * Ajustes, o `null` = entrega propia. No avisa al cliente: el aviso sale al marcarlo como enviado, con la guía.
 */
export async function marcarPendienteEnvio(pedidoId: string, actor: Actor, paqueteria: string | null): Promise<{ ok: true } | Fallo> {
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, entrega: true, metodoPago: true } });
  if (!p) return fallo("El pedido no existe.");
  if (p.entrega !== "envio") return fallo("Solo un pedido con envío pasa a pendiente de envío.");
  if (!transicionValida(p.estado, "pendiente_envio", p.entrega, p.metodoPago)) return fallo(`Un pedido ${ETIQUETA_ESTADO[p.estado].toLowerCase()} no puede pasar a pendiente de envío.`);
  const elegida = paqueteria?.trim() || null;
  if (elegida && !(await obtenerAjustesPedidos()).paqueterias.includes(elegida)) return fallo("Esa paquetería no está en la lista de Ajustes → Pagos y envíos.");
  const r = await avanzarPedido(pedidoId, "pendiente_envio", actor, { envio: { nota: elegida ? `Sale por ${elegida}` : "Entrega propia", datos: { paqueteria: elegida } } });
  return r.ok ? { ok: true } : r;
}
/** La guía adjunta: si salió por el chat o hay que mandarla a mano (canal cerrado, sin conexión o que no acepta PDF). */
export type ResultadoGuia = { estado: "enviada" | "manual"; url: string; nombre: string };

/**
 * Marca el pedido como enviado (viene de «pendiente de envío», donde se eligió por dónde sale). Por paquetería exige el número
 * de guía y la guía adjunta (foto o PDF; la nueva o la que ya tenía); con entrega propia no lleva ni guía ni archivo. Todo se
 * valida antes de guardar el archivo, y el archivo solo se guarda si el pedido de verdad puede pasar a «enviado». Al cliente le
 * llega el aviso con la guía y, después, el archivo.
 */
export async function marcarEnviado(pedidoId: string, actor: Actor, e: EnvioPedido): Promise<{ ok: true; aviso?: ResultadoAviso; guia?: ResultadoGuia } | Fallo> {
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, entrega: true, metodoPago: true, conversacionId: true, paqueteria: true, guiaArchivoUrl: true, guiaArchivoNombre: true } });
  if (!p) return fallo("El pedido no existe.");
  if (p.entrega !== "envio") return fallo("Solo un pedido con envío se marca como enviado.");
  if (p.estado === "preparando") return fallo("Primero páselo a «pendiente de envío» y elija por dónde sale.");
  if (!transicionValida(p.estado, "enviado", p.entrega, p.metodoPago)) return fallo(`Un pedido ${ETIQUETA_ESTADO[p.estado].toLowerCase()} no puede pasar a enviado.`);

  const paqueteria = p.paqueteria; // se eligió al pasarlo a pendiente de envío (vacía = entrega propia)
  let guia: string | null = null;
  let nuevo: ArchivoDeGuia | null = null;
  if (paqueteria) {
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
  const r = await avanzarPedido(pedidoId, "enviado", actor, { envio: { nota, datos: { guia, guiaArchivoUrl: url, guiaArchivoNombre: nombre } } });
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
  if (!["pagado", "preparando", "pendiente_envio", "enviado"].includes(p.estado)) return fallo("La guía se escribe cuando el pedido ya está pagado y todavía no se entregó.");
  await db.order.update({ where: { id: pedidoId }, data: { guia: g || null } });
  await log(actor, "guia_pedido", "Order", pedidoId, { codigo: p.codigo, guia: g });
  return { ok: true };
}
