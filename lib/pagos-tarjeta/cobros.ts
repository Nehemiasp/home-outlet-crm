import { log } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { avisarCliente, resumenPagos, type ResultadoAviso } from "@/lib/pedidos/avisos";
import { confirmarPago, type ActorPagos } from "@/lib/pedidos/pagos";
import { lineaDeSistema } from "@/lib/pedidos/pedidos";
import { formatQ } from "@/lib/utils";
import { pasarela } from "./index";
import type { EventoPasarela, Pasarela } from "./tipos";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** ¿Se puede cobrar con tarjeta? Hay una pasarela conectada y el método está encendido en Ajustes. */
export async function tarjetaActiva() {
  return !!pasarela() && (await obtenerAjustesPedidos()).metodos.includes("tarjeta");
}

/**
 * Pide a la pasarela el cobro del saldo del pedido y le manda el enlace al cliente por la conversación. Si ya hay un cobro abierto
 * por ese mismo saldo, reutiliza su enlace (así el cliente no puede quedar con dos enlaces vivos por lo mismo).
 * El pedido no cambia de estado: solo cuando la pasarela avise que se pagó se registra y se confirma el pago.
 */
export async function crearEnlaceDePago(pedidoId: string, actor: ActorPagos): Promise<{ ok: true; url: string; monto: number; reutilizado: boolean; aviso: ResultadoAviso } | Fallo> {
  const p = pasarela();
  if (!p) return fallo("No hay una pasarela de pago conectada.");
  if (!(await obtenerAjustesPedidos()).metodos.includes("tarjeta")) return fallo("El pago con tarjeta no está activo en Ajustes → Pagos y envíos.");
  const pedido = await db.order.findUnique({ where: { id: pedidoId }, select: { id: true, codigo: true, estado: true, conversacionId: true } });
  if (!pedido) return fallo("El pedido no existe.");
  if (pedido.estado !== "pendiente_pago") return fallo("Solo se puede enviar el enlace de pago de un pedido pendiente de pago.");
  const { saldo, enRevision } = await resumenPagos(pedido.id);
  if (saldo <= 0) return fallo("El pedido no tiene saldo por pagar.");
  if (enRevision > 0) return fallo("Hay un comprobante por verificar. Revíselo antes de pedir otro pago.");

  const abierto = await db.cobroTarjeta.findFirst({ where: { pedidoId: pedido.id, estado: "creado", monto: saldo }, orderBy: { creado: "desc" } });
  let cobro = abierto;
  if (!cobro) {
    const nuevo = await p.crearCobro({ referencia: pedido.codigo, monto: saldo, descripcion: `Pedido ${pedido.codigo}` }).catch(() => null);
    if (!nuevo) return fallo("La pasarela no respondió. Intente de nuevo en un momento.");
    cobro = await db.cobroTarjeta.create({ data: { pedidoId: pedido.id, pasarela: p.nombre, externoId: nuevo.externoId, monto: saldo, url: nuevo.url, creadoPorId: actor.id } });
    await log(actor, "crear_cobro_tarjeta", "CobroTarjeta", cobro.id, { pedido: pedido.codigo, monto: saldo });
    if (pedido.conversacionId) await lineaDeSistema(actor, pedido.conversacionId, `${actor.nombre} envió un enlace de pago con tarjeta de ${formatQ(saldo)} del pedido ${pedido.codigo}`);
  }
  const aviso = await avisarCliente(pedido.id, "enlace_tarjeta", { usuarioId: actor.id, extra: { enlace: cobro.url, saldo: formatQ(saldo) } });
  return { ok: true, url: cobro.url, monto: saldo, reutilizado: !!abierto, aviso };
}

export type ResultadoEvento = { ok: true; estado: "pagado" | "fallido" | "repetido"; revisar?: boolean } | Fallo;

/**
 * Lo que hace el webhook de la pasarela, ya con la firma validada. Es idempotente (el proveedor repite avisos) y nunca confía en
 * el monto sin compararlo: si coincide con lo pedido y el pedido sigue esperando pago, el pago se registra y se confirma solo;
 * si no, se registra «en revisión» y se deja un aviso en la conversación para que una persona lo resuelva (posible reembolso).
 */
export async function procesarEventoPasarela(e: EventoPasarela, p: Pasarela): Promise<ResultadoEvento> {
  const cobro = await db.cobroTarjeta.findUnique({ where: { externoId: e.externoId }, include: { pedido: { select: { id: true, codigo: true, estado: true, conversacionId: true } } } });
  if (!cobro || cobro.pasarela !== p.nombre) return fallo("Cobro desconocido.");
  if (cobro.estado !== "creado") return { ok: true, estado: "repetido" };
  // Solo el primer aviso lo logra, aunque lleguen dos a la vez.
  const reclamado = await db.cobroTarjeta.updateMany({ where: { id: cobro.id, estado: "creado" }, data: { estado: e.estado, resueltoEn: new Date() } });
  if (reclamado.count === 0) return { ok: true, estado: "repetido" };
  const o = cobro.pedido;

  if (e.estado === "fallido") {
    await db.activityLog.create({ data: { accion: "cobro_tarjeta_fallido", entidad: "CobroTarjeta", entidadId: cobro.id, detalle: { pedido: o.codigo, monto: cobro.monto } } });
    if (o.conversacionId) await lineaDeSistema(null, o.conversacionId, `El pago con tarjeta del pedido ${o.codigo} no se completó`);
    return { ok: true, estado: "fallido" };
  }

  const pago = await db.payment.create({ data: { pedidoId: o.id, tipo: "tarjeta", banco: p.nombre, referencia: e.referencia ?? e.externoId, monto: e.monto, fechaPago: new Date(), estado: "en_revision" } });
  const aplicable = e.monto === cobro.monto && (o.estado === "pendiente_pago" || o.estado === "en_revision");
  if (!aplicable) {
    await db.activityLog.create({ data: { accion: "cobro_tarjeta_por_revisar", entidad: "Payment", entidadId: pago.id, detalle: { pedido: o.codigo, pedido_estado: o.estado, monto_pedido: cobro.monto, monto_pagado: e.monto } } });
    if (o.conversacionId) await lineaDeSistema(null, o.conversacionId, `Se recibió un pago con tarjeta de ${formatQ(e.monto)} del pedido ${o.codigo} que no se pudo aplicar solo (${e.monto !== cobro.monto ? "el monto no coincide" : "el pedido ya no espera pago"}). Revíselo y, si hace falta, devuélvalo.`);
    return { ok: true, estado: "pagado", revisar: true };
  }
  const r = await confirmarPago(pago.id, "sistema");
  if (!r.ok) {
    await db.activityLog.create({ data: { accion: "cobro_tarjeta_por_revisar", entidad: "Payment", entidadId: pago.id, detalle: { pedido: o.codigo, error: r.error } } });
    return { ok: true, estado: "pagado", revisar: true };
  }
  return { ok: true, estado: "pagado" };
}

/** Los cobros de un pedido, del más nuevo al más viejo, para el detalle. */
export const cobrosDePedido = (pedidoId: string) => db.cobroTarjeta.findMany({ where: { pedidoId }, orderBy: { creado: "desc" }, select: { id: true, monto: true, estado: true, url: true, creado: true } });
