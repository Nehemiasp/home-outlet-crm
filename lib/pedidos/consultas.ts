import type { Channel } from "@/lib/canales/tipos";
import { db } from "@/lib/db";
import type { EstadoPedido, Prisma, TipoPago } from "@/generated/prisma/client";
import { filtroCotizacion, filtroPedido, redactarDuplicados, type Actor, type DuplicadoVisible } from "@/lib/visibilidad";
import { nombreMetodo } from "./metodos";
import { buscarDuplicados } from "./pagos";
import { estadoDePago, saldoDe, type EstadoPagoVista } from "./totales";
import { veTodo } from "@/lib/permisos";

/** Las pestañas de la lista de pedidos. Cada una agrupa estados. */
export const VISTAS = ["por-verificar", "pendientes", "en-proceso", "entregados", "todos"] as const;
export type Vista = (typeof VISTAS)[number];
export const ESTADOS_DE_VISTA: Record<Vista, readonly EstadoPedido[] | null> = {
  "por-verificar": ["en_revision"],
  pendientes: ["pendiente_pago"],
  "en-proceso": ["pagado", "preparando", "listo_para_recoger", "enviado"],
  entregados: ["entregado"],
  todos: null,
};

export type FiltrosPedidos = {
  q: string;
  vista: Vista;
  canal: "todos" | Channel;
  /** Solo para administradores: «todos», «sin» (sin asesor) o el id de un asesor. */
  asesor: string;
  entrega: "todas" | "recoger" | "envio";
  /** AAAA-MM-DD en hora de Guatemala; vacío = sin límite. */
  desde: string;
  hasta: string;
  limite: number;
};

export type FilaPedido = {
  id: string;
  codigo: string;
  cliente: string;
  contactoId: string;
  canal: Channel;
  fecha: string;
  total: number;
  estado: EstadoPedido;
  pago: EstadoPagoVista;
  entrega: "recoger" | "envio";
  /** La forma de pago elegida al crear el pedido (los pedidos anteriores no la tienen). */
  metodoPago: TipoPago | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const inicioDia = (f: string) => new Date(`${f}T00:00:00-06:00`);
const finDia = (f: string) => new Date(`${f}T23:59:59.999-06:00`);

/** Cuántos pedidos hay en cada pestaña con contador (sin importar la búsqueda ni los filtros), y las cotizaciones vigentes. */
export type ContadoresPedidos = { porVerificar: number; pendientes: number; enProceso: number; cotizaciones: number };

export async function contarVistas(u: Actor): Promise<ContadoresPedidos> {
  const visible = await filtroPedido(u);
  const contar = (v: Vista) => db.order.count({ where: { estado: { in: [...ESTADOS_DE_VISTA[v]!] }, ...visible } });
  const vigentes = async () => db.cotizacion.count({ where: { estado: "enviada", validaHasta: { gte: new Date() }, ...(await filtroCotizacion(u)) } });
  const [porVerificar, pendientes, enProceso, cotizaciones] = await Promise.all([contar("por-verificar"), contar("pendientes"), contar("en-proceso"), vigentes()]);
  return { porVerificar, pendientes, enProceso, cotizaciones };
}

export async function listarPedidos(f: FiltrosPedidos, u: Actor): Promise<{ items: FilaPedido[]; hayMas: boolean; contadores: ContadoresPedidos }> {
  const visible = await filtroPedido(u);
  const q = f.q.trim();
  const digitos = q.replace(/\D/g, "");
  const creada = { ...(FECHA.test(f.desde) ? { gte: inicioDia(f.desde) } : {}), ...(FECHA.test(f.hasta) ? { lte: finDia(f.hasta) } : {}) };
  const where: Prisma.OrderWhereInput = {
    AND: [visible],
    ...(veTodo(u) && f.asesor === "sin" ? { conversacion: { asignadaAId: null } } : veTodo(u) && f.asesor !== "todos" ? { conversacion: { asignadaAId: f.asesor } } : {}),
    ...(ESTADOS_DE_VISTA[f.vista] ? { estado: { in: [...ESTADOS_DE_VISTA[f.vista]!] } } : {}),
    ...(f.canal !== "todos" ? { canal: f.canal } : {}),
    ...(f.entrega !== "todas" ? { entrega: f.entrega } : {}),
    ...(Object.keys(creada).length ? { creada } : {}),
    ...(q
      ? { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { contacto: { nombre: { contains: q, mode: "insensitive" } } }, ...(digitos.length >= 3 ? [{ contacto: { telefono: { contains: digitos } } }] : [])] }
      : {}),
  };
  const filas = await db.order.findMany({
    where, orderBy: { creada: "desc" }, take: f.limite + 1,
    select: { id: true, codigo: true, contactoId: true, canal: true, creada: true, total: true, estado: true, entrega: true, metodoPago: true, contacto: { select: { nombre: true } }, pagos: { select: { monto: true, estado: true } } },
  });
  return {
    contadores: await contarVistas(u),
    hayMas: filas.length > f.limite,
    items: filas.slice(0, f.limite).map((o) => ({
      id: o.id, codigo: o.codigo, cliente: o.contacto.nombre, contactoId: o.contactoId, canal: o.canal as Channel, fecha: o.creada.toISOString(), total: o.total, estado: o.estado, entrega: o.entrega, metodoPago: o.metodoPago,
      pago: estadoDePago(o.total, o.pagos),
    })),
  };
}

export const contarPorVerificar = async (u: Actor) => db.payment.count({ where: { estado: "en_revision", pedido: { estado: { in: ["en_revision", "pendiente_pago"] }, ...(await filtroPedido(u)) } } });

export type DetallePedido = {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  entrega: "recoger" | "envio";
  canal: Channel;
  creada: string;
  notas: string | null;
  guia: string | null;
  direccion: string | null;
  departamento: string | null;
  municipio: string | null;
  zona: string | null;
  sobrePedido: boolean;
  reservadoHasta: string | null;
  subtotal: number;
  descuentoMonto: number;
  descuentoMotivo: string | null;
  costoEnvio: number;
  total: number;
  contacto: { id: string; nombre: string; telefono: string | null };
  conversacionId: string | null;
  creadoPor: { id: string; nombre: string } | null;
  lineas: { id: string; nombre: string; sku: string; precio: number; cantidad: number; ubicacion: string | null; imagenUrl: string | null }[];
  pagos: {
    id: string; tipo: string; metodo: string; banco: string | null; referencia: string | null; monto: number; fechaPago: string; estado: "en_revision" | "verificado" | "rechazado";
    comprobanteUrl: string | null; motivoRechazo: string | null; registradoPor: string | null; verificadoPor: string | null; verificadoEn: string | null; duplicados: DuplicadoVisible[];
  }[];
  /** Enlaces de pago con tarjeta pedidos a la pasarela, del más nuevo al más viejo. */
  cobrosTarjeta: { id: string; monto: number; estado: "creado" | "pagado" | "fallido" | "cancelado"; creado: string }[];
  /** La forma de pago elegida al crear el pedido, o null en los pedidos anteriores. */
  metodoPago: TipoPago | null;
  resumenPagos: { total: number; verificado: number; enRevision: number; saldo: number };
  pagoEstado: EstadoPagoVista;
  eventos: { id: string; de: EstadoPedido | null; a: EstadoPedido; quien: string; nota: string | null; fecha: string }[];
};

export async function cargarPedido(id: string, u: Actor): Promise<DetallePedido | null> {
  const o = await db.order.findFirst({
    where: { id, ...(await filtroPedido(u)) },
    include: {
      contacto: { select: { id: true, nombre: true, telefono: true } },
      creadoPor: { select: { id: true, nombre: true } },
      lineas: { orderBy: [{ nombre: "asc" }, { id: "asc" }], include: { ubicacion: { select: { nombre: true } }, producto: { select: { imagenes: true } } } },
      pagos: { orderBy: { creado: "asc" }, include: { mensaje: { select: { archivoUrl: true } }, registradoPor: { select: { nombre: true } }, verificadoPor: { select: { nombre: true } } } },
      eventos: { orderBy: { fecha: "asc" }, include: { usuario: { select: { nombre: true } } } },
      cobrosTarjeta: { orderBy: { creado: "desc" }, select: { id: true, monto: true, estado: true, creado: true } },
    },
  });
  if (!o) return null;
  const verificado = o.pagos.filter((p) => p.estado === "verificado").reduce((t, p) => t + p.monto, 0);
  const enRevision = o.pagos.filter((p) => p.estado === "en_revision").reduce((t, p) => t + p.monto, 0);
  const duplicados = await Promise.all(o.pagos.map(async (p) => (p.estado === "rechazado" ? [] : redactarDuplicados(u, await buscarDuplicados(p.banco, p.referencia, p.id)))));
  return {
    id: o.id, codigo: o.codigo, estado: o.estado, entrega: o.entrega, canal: o.canal as Channel, creada: o.creada.toISOString(), notas: o.notas, guia: o.guia, direccion: o.direccion, departamento: o.departamento, municipio: o.municipio, zona: o.zona,
    sobrePedido: o.sobrePedido, reservadoHasta: o.reservadoHasta?.toISOString() ?? null,
    subtotal: o.subtotal, descuentoMonto: o.descuentoMonto, descuentoMotivo: o.descuentoMotivo, costoEnvio: o.costoEnvio, total: o.total,
    contacto: o.contacto, conversacionId: o.conversacionId, creadoPor: o.creadoPor,
    lineas: o.lineas.map((l) => ({ id: l.id, nombre: l.nombre, sku: l.sku, precio: l.precio, cantidad: l.cantidad, ubicacion: l.ubicacion?.nombre ?? null, imagenUrl: l.producto?.imagenes[0] ?? null })),
    pagos: o.pagos.map((p, i) => ({
      id: p.id, tipo: p.tipo, metodo: nombreMetodo(p.tipo), banco: p.banco, referencia: p.referencia, monto: p.monto, fechaPago: p.fechaPago.toISOString(), estado: p.estado,
      comprobanteUrl: p.archivoUrl ?? p.mensaje?.archivoUrl ?? null, motivoRechazo: p.motivoRechazo, registradoPor: p.registradoPor?.nombre ?? null, verificadoPor: p.verificadoPor?.nombre ?? null, verificadoEn: p.verificadoEn?.toISOString() ?? null,
      duplicados: duplicados[i]!,
    })),
    metodoPago: o.metodoPago,
    cobrosTarjeta: o.cobrosTarjeta.map((c) => ({ id: c.id, monto: c.monto, estado: c.estado, creado: c.creado.toISOString() })),
    resumenPagos: { total: o.total, verificado, enRevision, saldo: saldoDe(o.total, verificado) },
    pagoEstado: estadoDePago(o.total, o.pagos),
    eventos: o.eventos.map((e) => ({ id: e.id, de: e.deEstado, a: e.aEstado, quien: e.usuario?.nombre ?? (e.origen === "asistente" ? "Asistente" : "Sistema"), nota: e.nota, fecha: e.fecha.toISOString() })),
  };
}
