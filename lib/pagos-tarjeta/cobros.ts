import { log } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { avisarCliente, resumenPagos, type ResultadoAviso } from "@/lib/pedidos/avisos";
import { confirmarPago, type ActorPagos } from "@/lib/pedidos/pagos";
import { lineaDeSistema } from "@/lib/pedidos/pedidos";
import { formatQ } from "@/lib/utils";
import { abrirCobro } from "./abrir";
import { pasarela } from "./index";
import type { EventoPasarela, Pasarela } from "./tipos";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** ¿Se puede cobrar con tarjeta? Basta con que el método esté encendido en Ajustes (el enlace de pago lo pega la persona). */
export async function tarjetaActiva() {
  return (await obtenerAjustesPedidos()).metodos.includes("tarjeta");
}

/**
 * Le manda al cliente el enlace de pago con tarjeta por el saldo del pedido. `enlace` es el que pega la persona (Paggo); sin él se
 * reenvía el que ya está abierto, o se pide a la pasarela si hubiera una conectada. El pedido no cambia de estado: el pago se
 * registra con su comprobante y se confirma como cualquier otro.
 */
export async function crearEnlaceDePago(pedidoId: string, actor: ActorPagos, enlace?: string | null): Promise<{ ok: true; url: string; monto: number; reutilizado: boolean; aviso: ResultadoAviso } | Fallo> {
  if (!(await obtenerAjustesPedidos()).metodos.includes("tarjeta")) return fallo("El pago con tarjeta no está activo en Ajustes → Pagos y envíos.");
  const pedido = await db.order.findUnique({ where: { id: pedidoId }, select: { id: true, codigo: true, estado: true, conversacionId: true } });
  if (!pedido) return fallo("El pedido no existe.");
  if (pedido.estado !== "pendiente_pago") return fallo("Solo se puede enviar el enlace de pago de un pedido pendiente de pago.");
  const { saldo, enRevision } = await resumenPagos(pedido.id);
  if (saldo <= 0) return fallo("El pedido no tiene saldo por pagar.");
  if (enRevision > 0) return fallo("Hay un comprobante por verificar. Revíselo antes de pedir otro pago.");

  // Sin enlace nuevo: se reenvía el que ya está abierto por ese saldo (si lo hay).
  const abierto = enlace?.trim() || pasarela() ? null : await db.cobroTarjeta.findFirst({ where: { pedidoId: pedido.id, estado: "creado", monto: saldo }, orderBy: { creado: "desc" }, select: { url: true } });
  const cobro = await abrirCobro({ pedidoId: pedido.id, codigo: pedido.codigo, monto: saldo, creadoPorId: actor.id, enlace: enlace?.trim() || abierto?.url || null });
  if (!cobro.ok) return fallo(cobro.error);
  if (!cobro.reutilizado) {
    await log(actor, "crear_cobro_tarjeta", "CobroTarjeta", cobro.cobroId, { pedido: pedido.codigo, monto: saldo });
    if (pedido.conversacionId) await lineaDeSistema(actor, pedido.conversacionId, `${actor.nombre} envió un enlace de pago con tarjeta de ${formatQ(saldo)} del pedido ${pedido.codigo}`);
  }
  const aviso = await avisarCliente(pedido.id, "enlace_tarjeta", { usuarioId: actor.id, extra: { enlace: cobro.url, saldo: formatQ(saldo) } });
  return { ok: true, url: cobro.url, monto: saldo, reutilizado: cobro.reutilizado, aviso };
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
  // Un cobro cancelado (se cambió la forma de pago) que aun así se paga NO se pierde: el pago queda en revisión (ver abajo).
  const eraCancelado = cobro.estado === "cancelado" && e.estado === "pagado";
  if (cobro.estado !== "creado" && !eraCancelado) return { ok: true, estado: "repetido" };
  // Solo el primer aviso lo logra, aunque lleguen dos a la vez.
  const reclamado = await db.cobroTarjeta.updateMany({ where: { id: cobro.id, estado: eraCancelado ? "cancelado" : "creado" }, data: { estado: e.estado, resueltoEn: new Date() } });
  if (reclamado.count === 0) return { ok: true, estado: "repetido" };
  const o = cobro.pedido;

  if (e.estado === "fallido") {
    await db.activityLog.create({ data: { accion: "cobro_tarjeta_fallido", entidad: "CobroTarjeta", entidadId: cobro.id, detalle: { pedido: o.codigo, monto: cobro.monto } } });
    if (o.conversacionId) await lineaDeSistema(null, o.conversacionId, `El pago con tarjeta del pedido ${o.codigo} no se completó`);
    return { ok: true, estado: "fallido" };
  }

  const pago = await db.payment.create({ data: { pedidoId: o.id, tipo: "tarjeta", banco: p.nombre, referencia: e.referencia ?? e.externoId, monto: e.monto, fechaPago: new Date(), estado: "en_revision" } });
  const aplicable = !eraCancelado && e.monto === cobro.monto && (o.estado === "pendiente_pago" || o.estado === "en_revision");
  if (!aplicable) {
    await db.activityLog.create({ data: { accion: "cobro_tarjeta_por_revisar", entidad: "Payment", entidadId: pago.id, detalle: { pedido: o.codigo, pedido_estado: o.estado, monto_pedido: cobro.monto, monto_pagado: e.monto } } });
    if (o.conversacionId) await lineaDeSistema(null, o.conversacionId, `Se recibió un pago con tarjeta de ${formatQ(e.monto)} del pedido ${o.codigo} que no se pudo aplicar solo (${eraCancelado ? "era de un enlace que se había cancelado" : e.monto !== cobro.monto ? "el monto no coincide" : "el pedido ya no espera pago"}). Revíselo y, si hace falta, devuélvalo.`);
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
