import { log } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/dinero";
import { puedeVerificarPagos, type ActorPedido } from "@/lib/permisos";
import type { TipoPago } from "@/generated/prisma/client";
import { obtenerAjustesPedidos } from "./ajustes";
import { avisarCliente, resumenPagos, type ResultadoAviso } from "./avisos";
import { cambiarEstado } from "./flujo";
import { lineaDeSistema } from "./pedidos";
import { METODOS } from "./metodos";
import { formatQ } from "@/lib/utils";

export type ActorPagos = ActorPedido & { nombre: string };
type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });
const REQUIEREN_BANCO: TipoPago[] = ["transferencia", "deposito"];
const DIA = 86_400_000;

export type EntradaPago = {
  pedidoId: string;
  tipo: string;
  banco: string;
  referencia: string;
  /** Lo que escribió la persona, p. ej. "1,250.00". */
  monto: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** La imagen del cliente en la conversación… */
  mensajeId?: string | null;
  /** …o un archivo subido desde el detalle del pedido. */
  archivoUrl?: string | null;
};

export type Duplicado = { pagoId: string; pedidoId: string; codigo: string; estado: string };

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/** Otros pagos con el mismo banco y la misma referencia (sin contar los rechazados). No bloquea: solo avisa. */
export async function buscarDuplicados(banco: string | null, referencia: string | null, excluirPagoId?: string): Promise<Duplicado[]> {
  if (!banco?.trim() || !referencia?.trim()) return [];
  const candidatos = await db.payment.findMany({
    where: { estado: { not: "rechazado" }, banco: { equals: banco.trim(), mode: "insensitive" }, referencia: { equals: referencia.trim(), mode: "insensitive" }, ...(excluirPagoId ? { id: { not: excluirPagoId } } : {}) },
    include: { pedido: { select: { id: true, codigo: true } } },
  });
  return candidatos.filter((p) => norm(p.banco ?? "") === norm(banco) && norm(p.referencia ?? "") === norm(referencia)).map((p) => ({ pagoId: p.id, pedidoId: p.pedido.id, codigo: p.pedido.codigo, estado: p.estado }));
}

/** Registra un comprobante: el pedido pasa a «pago en revisión» y queda esperando a quien verifica. */
export async function registrarPago(e: EntradaPago, actor: ActorPagos): Promise<{ ok: true; pagoId: string; duplicados: Duplicado[]; aviso: ResultadoAviso } | Fallo> {
  const pedido = await db.order.findUnique({ where: { id: e.pedidoId }, select: { id: true, estado: true, conversacionId: true, codigo: true } });
  if (!pedido) return fallo("El pedido no existe.");
  if (pedido.estado !== "pendiente_pago" && pedido.estado !== "en_revision") return fallo("Solo se registran pagos de pedidos pendientes de pago o en revisión.");

  const aj = await obtenerAjustesPedidos();
  const metodo = METODOS.find((m) => m.id === e.tipo);
  if (!metodo || !aj.metodos.includes(metodo.id)) return fallo("Ese método de pago no está activo.");
  const banco = e.banco.trim();
  const referencia = e.referencia.trim();
  if (REQUIEREN_BANCO.includes(metodo.id)) {
    if (!banco) return fallo("Escriba el banco.");
    if (!referencia) return fallo("Escriba la referencia o el número de boleta.");
  }
  if (banco.length > 60 || referencia.length > 60) return fallo("El banco o la referencia pasan de 60 caracteres.");

  const monto = parsePrecio(e.monto);
  if (!monto) return fallo("Escriba el monto como un precio, por ejemplo 1,250.00.");

  const fecha = new Date(`${e.fecha}T12:00:00-06:00`); // mediodía de Guatemala: el día no cambia al pasar a UTC
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha) || Number.isNaN(fecha.getTime())) return fallo("Escriba la fecha del pago.");
  if (fecha.getTime() > Date.now() + DIA) return fallo("La fecha del pago no puede ser futura.");
  if (fecha.getTime() < Date.now() - 400 * DIA) return fallo("La fecha del pago es de hace más de un año. Revísela.");

  if (e.mensajeId) {
    const m = await db.message.findUnique({ where: { id: e.mensajeId }, select: { conversacionId: true, direccion: true, tipo: true } });
    if (!m || m.conversacionId !== pedido.conversacionId || m.direccion !== "entrante" || m.tipo !== "image") return fallo("Esa imagen no es del cliente de este pedido.");
    if (await db.payment.count({ where: { mensajeId: e.mensajeId, estado: { not: "rechazado" } } })) return fallo("Esa imagen ya se registró como comprobante.");
  }

  const pago = await db.payment.create({
    data: { pedidoId: pedido.id, tipo: metodo.id, banco: banco || null, referencia: referencia || null, monto, fechaPago: fecha, mensajeId: e.mensajeId ?? null, archivoUrl: e.archivoUrl ?? null, registradoPorId: actor.id },
  });
  if (pedido.estado === "pendiente_pago") {
    const r = await cambiarEstado({ pedidoId: pedido.id, a: "en_revision", quien: { usuarioId: actor.id }, nota: `Comprobante de ${formatQ(monto)} registrado` });
    if (!r.ok) return fallo(r.error);
  }
  await log(actor, "registrar_pago", "Payment", pago.id, { pedido: pedido.codigo, monto });
  if (pedido.conversacionId) await lineaDeSistema(actor, pedido.conversacionId, `${actor.nombre} registró un comprobante de ${formatQ(monto)} en el pedido ${pedido.codigo}`);

  const [duplicados, aviso] = await Promise.all([buscarDuplicados(banco, referencia, pago.id), avisarCliente(pedido.id, "comprobante_recibido", { usuarioId: actor.id })]);
  return { ok: true, pagoId: pago.id, duplicados, aviso };
}

/** Confirma un pago. Si lo verificado cubre el total, el pedido pasa a «pagado» y se descuentan las existencias. */
export async function verificarPago(pagoId: string, actor: ActorPagos): Promise<{ ok: true; cubierto: boolean; saldo: number; aviso: ResultadoAviso } | Fallo> {
  if (!puedeVerificarPagos(actor)) return fallo("No tiene permiso para verificar pagos.");
  return confirmarPago(pagoId, actor);
}

/**
 * La confirmación en sí, sin revisar permisos (quien llama ya lo hizo). `"sistema"` es la pasarela de tarjeta: el pago lo
 * confirmó el banco, no una persona, y queda sin «verificado por».
 */
export async function confirmarPago(pagoId: string, quien: ActorPagos | "sistema"): Promise<{ ok: true; cubierto: boolean; saldo: number; aviso: ResultadoAviso } | Fallo> {
  const persona = quien === "sistema" ? null : quien;
  const pago = await db.payment.findUnique({ where: { id: pagoId }, include: { pedido: { select: { id: true, estado: true, codigo: true, conversacionId: true } } } });
  if (!pago) return fallo("El pago no existe.");
  if (pago.estado !== "en_revision") return fallo("Este pago ya se revisó.");
  const o = pago.pedido;
  if (o.estado !== "en_revision" && o.estado !== "pendiente_pago") return fallo(`El pedido está ${o.estado.replace("_", " ")} y ya no acepta pagos.`);

  // Solo la primera persona que confirma lo logra; si dos lo intentan a la vez, la otra recibe el aviso.
  const marcado = await db.payment.updateMany({ where: { id: pagoId, estado: "en_revision" }, data: { estado: "verificado", verificadoPorId: persona?.id ?? null, verificadoEn: new Date() } });
  if (marcado.count === 0) return fallo("Este pago ya se revisó.");

  const r = await resumenPagos(o.id);
  const cubierto = r.saldo === 0;
  let estado: string = o.estado;
  if (cubierto) {
    const c = await cambiarEstado({ pedidoId: o.id, a: "pagado", quien: persona ? { usuarioId: persona.id } : "sistema", nota: persona ? "Pago confirmado" : "Pago con tarjeta confirmado por la pasarela" });
    if (!c.ok) {
      await db.payment.update({ where: { id: pagoId }, data: { estado: "en_revision", verificadoPorId: null, verificadoEn: null } });
      return fallo(c.error);
    }
    estado = "pagado";
  } else if (o.estado === "en_revision" && !(await db.payment.count({ where: { pedidoId: o.id, estado: "en_revision" } }))) {
    // Pago parcial y no queda nada por revisar: vuelve a esperar el resto.
    await cambiarEstado({ pedidoId: o.id, a: "pendiente_pago", quien: persona ? { usuarioId: persona.id } : "sistema", nota: `Pago parcial confirmado. Falta ${formatQ(r.saldo)}` });
    estado = "pendiente_pago";
  }
  if (persona) await log(persona, "verificar_pago", "Payment", pagoId, { pedido: o.codigo, monto: pago.monto, estado });
  else await db.activityLog.create({ data: { accion: "verificar_pago", entidad: "Payment", entidadId: pagoId, detalle: { pedido: o.codigo, monto: pago.monto, estado, por: "Pasarela de tarjeta" } } });
  const resto = cubierto ? "" : ` · falta ${formatQ(r.saldo)}`;
  if (o.conversacionId) await lineaDeSistema(persona, o.conversacionId, persona ? `${persona.nombre} confirmó un pago de ${formatQ(pago.monto)} del pedido ${o.codigo}${resto}` : `La pasarela confirmó un pago con tarjeta de ${formatQ(pago.monto)} del pedido ${o.codigo}${resto}`);
  const aviso = await avisarCliente(o.id, cubierto ? "pago_confirmado" : "pago_parcial", { usuarioId: persona?.id });
  return { ok: true, cubierto, saldo: r.saldo, aviso };
}

/** Rechaza un pago con motivo. El pedido vuelve a «pendiente de pago» si no queda otro comprobante por revisar. */
export async function rechazarPago(pagoId: string, motivo: string, actor: ActorPagos, mensaje?: string): Promise<{ ok: true; aviso: ResultadoAviso } | Fallo> {
  if (!puedeVerificarPagos(actor)) return fallo("No tiene permiso para verificar pagos.");
  const m = motivo.trim();
  if (!m) return fallo("Escriba el motivo del rechazo.");
  if (m.length > 200) return fallo("El motivo pasa de 200 caracteres.");
  const pago = await db.payment.findUnique({ where: { id: pagoId }, include: { pedido: { select: { id: true, estado: true, codigo: true, conversacionId: true } } } });
  if (!pago) return fallo("El pago no existe.");
  if (pago.estado !== "en_revision") return fallo("Este pago ya se revisó.");
  const o = pago.pedido;

  const marcado = await db.payment.updateMany({ where: { id: pagoId, estado: "en_revision" }, data: { estado: "rechazado", motivoRechazo: m, verificadoPorId: actor.id, verificadoEn: new Date() } });
  if (marcado.count === 0) return fallo("Este pago ya se revisó.");
  if (o.estado === "en_revision" && !(await db.payment.count({ where: { pedidoId: o.id, estado: "en_revision" } }))) {
    await cambiarEstado({ pedidoId: o.id, a: "pendiente_pago", quien: { usuarioId: actor.id }, nota: `Pago rechazado: ${m}` });
  }
  await log(actor, "rechazar_pago", "Payment", pagoId, { pedido: o.codigo, monto: pago.monto, motivo: m });
  if (o.conversacionId) await lineaDeSistema(actor, o.conversacionId, `${actor.nombre} rechazó un pago de ${formatQ(pago.monto)} del pedido ${o.codigo} · ${m}`);
  const aviso = await avisarCliente(o.id, "pago_rechazado", { usuarioId: actor.id, extra: { motivo: m }, textoEditado: mensaje });
  return { ok: true, aviso };
}
