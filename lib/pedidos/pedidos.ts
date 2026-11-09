import { obtenerNegocio, log } from "@/lib/ajustes";
import { adaptador } from "@/lib/canales";
import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/dinero";
import { enviarMensaje, salientesRestantes } from "@/lib/mensajeria";
import { puedeDescontar, puedeSobrePedido } from "@/lib/permisos";
import { aplicarDatos, textoCuentas } from "@/lib/plantillas";
import { normalizarTelefono } from "@/lib/telefono";
import { formatQ, formatTelefono } from "@/lib/utils";
import { abrirCobro, cancelarCobrosAbiertos } from "@/lib/pagos-tarjeta/abrir";
import { pasarela } from "@/lib/pagos-tarjeta";
import type { Prisma, TipoPago } from "@/generated/prisma/client";
import { listarZonas, obtenerAjustesPedidos } from "./ajustes";
import { departamentoOficial, lugarGuardado, municipioOficial, textoLugar } from "@/lib/guatemala";
import { costoSegunPago, zonaPara } from "./envio";
import { disponibleDe, disponibleProducto, apartadoProducto } from "./existencias";
import { cambiarEstado } from "./flujo";
import { compatibleConEntrega, METODOS, nombreMetodo } from "./metodos";
import { rellenar, textoHoras, textoResumen } from "./mensajes";
import { calcularTotales, saldoDe, type Descuento } from "./totales";
import { estadoDeCotizacion } from "./vigencia";
import type { DatosPanelPedido, EntradaPedido, ProductoPedido, ResultadoPedido, VistaPedido } from "./tipos";
import type { Rol } from "@/lib/permisos";
import { veTodo } from "@/lib/permisos";

export type ActorPedidos = { id: string; nombre: string; rol: Rol };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
type ResultadoAviso = import("./avisos").ResultadoAviso;
const MAX_LINEAS = 40;

/**
 * Por qué una forma de pago no se puede usar en este pedido, o null si sirve: tiene que estar activa en Ajustes, la tarjeta
 * necesita una pasarela conectada, el efectivo en tienda solo vale cuando el cliente recoge y el pago contra entrega, cuando se envía.
 */
export function errorDeForma(metodo: TipoPago, entrega: "recoger" | "envio", activos: readonly TipoPago[]): string | null {
  if (!activos.includes(metodo)) return `${nombreMetodo(metodo)} no está activo en Ajustes → Pagos y envíos.`;
  if (metodo === "tarjeta" && !pasarela()) return "El pago con tarjeta necesita una pasarela de pago conectada.";
  if (!compatibleConEntrega(metodo, entrega)) return metodo === "contra_entrega" ? "El pago contra entrega solo sirve cuando el pedido se envía." : "El pago en efectivo en tienda solo sirve cuando el cliente recoge el pedido.";
  return null;
}
const ABIERTOS = ["borrador", "pendiente_pago", "en_revision"] as const;

/* ── Productos para armar el pedido ── */
type ProductoConStock = Prisma.ProductGetPayload<{ include: { stock: { include: { ubicacion: true } } } }>;

export function aProductoPedido(p: ProductoConStock): ProductoPedido {
  const stock = p.stock.filter((s) => s.ubicacion.activa);
  return {
    id: p.id, nombre: p.nombre, sku: p.sku, precioCentavos: p.precio, imagenUrl: p.imagenes[0],
    disponible: disponibleProducto(stock), apartado: apartadoProducto(stock),
    ubicaciones: stock.map((s) => ({ id: s.ubicacionId, nombre: s.ubicacion.nombre, disponible: disponibleDe(s), apartado: s.apartado })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}
const CON_STOCK = { stock: { include: { ubicacion: true } } } as const;

export async function buscarParaPedido(q: string): Promise<ProductoPedido[]> {
  const busca = q.trim();
  const filas = await db.product.findMany({
    where: { activo: true, ...(busca ? { OR: [{ nombre: { contains: busca, mode: "insensitive" } }, { sku: { contains: busca, mode: "insensitive" } }] } : {}) },
    orderBy: { nombre: "asc" },
    take: 12,
    include: CON_STOCK,
  });
  return filas.map(aProductoPedido);
}

/** Productos de las tarjetas enviadas en la conversación y los que consultó el asistente. */
async function sugeridosDe(conversacionId: string): Promise<ProductoPedido[]> {
  const [tarjetas, runs] = await Promise.all([
    db.message.findMany({ where: { conversacionId, productoId: { not: null } }, orderBy: { fecha: "desc" }, take: 20, select: { productoId: true } }),
    db.aiRun.findMany({ where: { conversacionId }, orderBy: { creado: "desc" }, take: 20, select: { productos: true } }),
  ]);
  const ids = [...new Set([...tarjetas.map((t) => t.productoId!), ...runs.flatMap((r) => r.productos)])].slice(0, 6);
  if (ids.length === 0) return [];
  const filas = await db.product.findMany({ where: { id: { in: ids }, activo: true }, include: CON_STOCK });
  return ids.flatMap((id) => filas.filter((p) => p.id === id).map(aProductoPedido));
}

/* ── Precios de una cotización que se convierte en pedido ── */

/**
 * Los precios que el pedido debe respetar porque sale de una cotización: los de la cotización mientras estaba vigente (si el
 * catálogo bajó después, el más bajo). Un pedido ya ligado conserva esos precios si se creó antes de que la cotización venciera,
 * aunque se termine de armar después; si se crea con la cotización vencida, usa los precios de hoy y lo avisa.
 */
async function preciosDeCotizacion(e: EntradaPedido): Promise<{ ok: true; precios: Map<string, number> | null; aviso: string | null } | { ok: false; error: string }> {
  if (!e.cotizacionId) return { ok: true, precios: null, aviso: null };
  const c = await db.cotizacion.findUnique({ where: { id: e.cotizacionId }, include: { lineas: true } });
  if (!c || c.conversacionId !== e.conversacionId) return fallo("La cotización no existe en esta conversación.");
  const ligado = e.pedidoId ? await db.order.findFirst({ where: { id: e.pedidoId, cotizacionId: c.id }, select: { creada: true } }) : null;
  if (!ligado && c.estado === "aceptada") return fallo(`La cotización ${c.codigo} ya se convirtió en pedido.`);
  const desde = ligado?.creada ?? new Date();
  if (desde > c.validaHasta) return { ok: true, precios: null, aviso: `La cotización ${c.codigo} ya venció: el pedido lleva los precios de hoy.` };
  const precios = new Map<string, number>();
  for (const l of c.lineas) if (l.productoId && !precios.has(l.productoId)) precios.set(l.productoId, l.precio);
  return { ok: true, precios, aviso: null };
}

/* ── Validar y calcular (siempre en el servidor) ── */
async function preparar(e: EntradaPedido, actor: ActorPedidos) {
  const cotizados = await preciosDeCotizacion(e);
  if (!cotizados.ok) return cotizados;
  const aj = await obtenerAjustesPedidos();
  const ubicaciones = await db.location.findMany({ where: { activa: true }, select: { id: true } });
  const activas = new Set(ubicaciones.map((u) => u.id));
  const defecto = (e.entrega === "recoger" ? aj.ubicacionRecogerId : aj.ubicacionEnvioId) ?? null;

  if (e.lineas.length === 0) return fallo("Agregue al menos un producto.");
  if (e.lineas.length > MAX_LINEAS) return fallo(`Un pedido lleva hasta ${MAX_LINEAS} productos.`);
  const juntas = new Map<string, { productoId: string; ubicacionId: string | null; cantidad: number }>();
  for (const l of e.lineas) {
    if (!Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 999) return fallo("La cantidad de cada producto va de 1 a 999.");
    if (l.ubicacionId && !activas.has(l.ubicacionId)) return fallo("Alguna ubicación ya no existe o está desactivada.");
    const ubicacionId = l.ubicacionId ?? defecto;
    const k = `${l.productoId}|${ubicacionId}`;
    const previa = juntas.get(k);
    if (previa) previa.cantidad += l.cantidad;
    else juntas.set(k, { productoId: l.productoId, ubicacionId, cantidad: l.cantidad });
  }
  const lineasEntrada = [...juntas.values()];

  const ids = [...new Set(lineasEntrada.map((l) => l.productoId))];
  const productos = await db.product.findMany({ where: { id: { in: ids }, activo: true }, include: { stock: true } });
  if (productos.length !== ids.length) return fallo("Alguno de los productos ya no está disponible en el catálogo. Quítelo del pedido.");
  const por = new Map(productos.map((p) => [p.id, p]));

  const lineas = lineasEntrada.map((l) => {
    const p = por.get(l.productoId)!;
    const cotizado = cotizados.precios?.get(p.id);
    return { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: cotizado === undefined ? p.precio : Math.min(cotizado, p.precio), cantidad: l.cantidad, ubicacionId: l.ubicacionId };
  });
  const subtotal = lineas.reduce((t, l) => t + l.precio * l.cantidad, 0);

  // Existencias: con inventario separado cuenta la ubicación de cada línea; con compartido, el total del producto.
  const avisos: string[] = [];
  for (const id of ids) {
    const p = por.get(id)!;
    const delProducto = lineas.filter((l) => l.productoId === id);
    if (aj.inventario === "compartido") {
      const hay = disponibleProducto(p.stock.filter((s) => activas.has(s.ubicacionId)));
      if (delProducto.reduce((t, l) => t + l.cantidad, 0) > hay) avisos.push(`No hay existencia suficiente de ${p.nombre} (disponible ${hay}).`);
    } else {
      for (const l of delProducto) {
        const hay = l.ubicacionId ? disponibleDe(p.stock.find((s) => s.ubicacionId === l.ubicacionId) ?? { cantidad: 0, apartado: 0 }) : 0;
        if (l.cantidad > hay) avisos.push(`No hay existencia suficiente de ${p.nombre} en esa ubicación (disponible ${hay}).`);
      }
    }
  }
  const sinExistencia = avisos.length > 0;
  if (cotizados.aviso) avisos.push(cotizados.aviso); // va después: no es falta de existencia

  // Entrega
  // El lugar de entrega se elige de la lista oficial (departamento y, dentro de él, municipio). Para recoger en tienda no hace falta: se guarda solo si viene completo.
  const departamento = departamentoOficial(e.cliente.departamento);
  const municipio = municipioOficial(departamento, e.cliente.municipio);
  let zona: Awaited<ReturnType<typeof listarZonas>>[number] | null = null;
  let costo = 0;
  let direccion: string | null = null;
  if (e.entrega === "envio") {
    if (!departamento) return fallo("Elija el departamento de entrega.");
    if (!municipio) return fallo("Elija el municipio de entrega.");
    if (!e.direccion.trim()) return fallo("Escriba la dirección de entrega.");
    zona = zonaPara(await listarZonas(), departamento, municipio);
    if (!zona) return fallo(`No hay una zona de envío para ${textoLugar(municipio, departamento)}. Agréguela en Ajustes → Pagos y envíos.`);
    costo = costoSegunPago(aj, zona, subtotal, e.metodoPago);
    direccion = e.referencia.trim() ? `${e.direccion.trim()}. Referencia: ${e.referencia.trim()}` : e.direccion.trim();
    if (direccion.length > 500) return fallo("La dirección y la referencia pasan de 500 caracteres.");
  }

  // Descuento
  let descuento: Descuento = null;
  const valor = e.descuento?.valor.trim() ?? "";
  if (e.descuento && valor) {
    if (e.descuento.tipo === "monto") {
      const c = parsePrecio(valor);
      if (!c) return fallo("Escriba el descuento como un monto, por ejemplo 50.00.");
      descuento = { tipo: "monto", centavos: c };
    } else {
      const n = Number(valor.replace(",", "."));
      if (!(n > 0 && n <= 100)) return fallo("El porcentaje de descuento va de 0 a 100.");
      descuento = { tipo: "porcentaje", porcentaje: n };
    }
  }
  const t = calcularTotales(lineas, descuento, costo);
  const motivo = e.descuentoMotivo.trim();
  if (t.descuentoMonto > 0) {
    if (!motivo) return fallo("Escriba el motivo del descuento.");
    if (motivo.length > 200) return fallo("El motivo del descuento pasa de 200 caracteres.");
    if (!puedeDescontar(actor, t.descuentoMonto, t.subtotal, aj.descuentoMaxAgente)) return fallo(`Un descuento de más de ${aj.descuentoMaxAgente} % lo autoriza un administrador o un jefe de tienda.`);
  }
  if (e.notas.length > 500) return fallo("Las notas pasan de 500 caracteres.");
  const metodoPago = e.metodoPago ?? null;
  if (metodoPago) {
    const error = errorDeForma(metodoPago, e.entrega, aj.metodos);
    if (error) return fallo(error);
  }

  if ((metodoPago === null || metodoPago === "transferencia" || metodoPago === "deposito") && (await db.bankAccount.count({ where: { activa: true } })) === 0) avisos.push("No hay cuentas bancarias activas: el resumen saldría sin cuentas. Agréguelas en Ajustes → Pagos y envíos.");

  return {
    ok: true as const,
    lineas, ...t, zona, direccion, departamento, municipio, avisos, sinExistencia,
    descuentoMotivo: t.descuentoMonto > 0 ? motivo : null,
    notas: e.notas.trim() || null,
    metodoPago,
  };
}

export async function previsualizar(e: EntradaPedido, actor: ActorPedidos): Promise<ResultadoPedido<{ vista: VistaPedido }>> {
  const p = await preparar(e, actor);
  if (!p.ok) return p;
  return {
    ok: true,
    vista: {
      lineas: p.lineas.map((l) => ({ productoId: l.productoId, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, ubicacionId: l.ubicacionId, total: l.precio * l.cantidad })),
      subtotal: p.subtotal, descuentoMonto: p.descuentoMonto, costoEnvio: p.costoEnvio, total: p.total,
      zona: p.zona ? { nombre: p.zona.nombre, tiempo: p.zona.tiempo } : null,
      avisos: p.avisos, sinExistencia: p.sinExistencia,
    },
  };
}

/**
 * Nombre y teléfono del cliente como quedarán en el contacto (el panel deja corregirlos). Lo usan el pedido y la cotización.
 * El teléfono no puede ser el de otro contacto.
 */
export async function clienteDelPanel(e: EntradaPedido, contactoId: string): Promise<{ ok: true; nombre: string; telefono?: string } | { ok: false; error: string }> {
  const nombre = e.cliente.nombre.trim();
  if (!nombre) return fallo("Escriba el nombre del cliente.");
  if (nombre.length > 80) return fallo("El nombre del cliente pasa de 80 caracteres.");
  if (!e.cliente.telefono.trim()) return { ok: true, nombre };
  const t = normalizarTelefono(e.cliente.telefono);
  if (!t) return fallo("El teléfono no es válido. Use 8 dígitos, por ejemplo 5555 1234.");
  const otro = await db.contact.findUnique({ where: { telefono: t }, select: { id: true, nombre: true } });
  if (otro && otro.id !== contactoId) return fallo(`Ese teléfono ya pertenece a ${otro.nombre}.`);
  return { ok: true, nombre, telefono: t };
}

/** Lo validado y calculado de lo que armó la persona en el panel (también sirve para la cotización). */
export const prepararPedido = preparar;

/* ── Guardar borrador ── */
export async function guardarBorrador(e: EntradaPedido, actor: ActorPedidos): Promise<ResultadoPedido<{ pedidoId: string; codigo: string }>> {
  const conv = await db.conversation.findUnique({ where: { id: e.conversacionId }, select: { id: true, contactoId: true, canal: true } });
  if (!conv) return fallo("La conversación no existe.");

  const cliente = await clienteDelPanel(e, conv.contactoId);
  if (!cliente.ok) return cliente;
  const { nombre, telefono } = cliente;

  const p = await preparar(e, actor);
  if (!p.ok) return p;

  const datos = {
    entrega: e.entrega, direccion: p.direccion, departamento: p.departamento, municipio: p.municipio, zona: p.zona?.nombre ?? null, subtotal: p.subtotal, descuentoMonto: p.descuentoMonto,
    descuentoMotivo: p.descuentoMotivo, costoEnvio: p.costoEnvio, total: p.total, notas: p.notas, metodoPago: p.metodoPago,
  };
  const lineas = p.lineas.map((l) => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, ubicacionId: l.ubicacionId }));

  const r = await db.$transaction(async (tx) => {
    const actualizarContacto = () => tx.contact.update({ where: { id: conv.contactoId }, data: { nombre, ...(telefono ? { telefono } : {}), ...(p.municipio ? { departamento: p.departamento, municipio: p.municipio } : {}) } });

    if (e.pedidoId) {
      const o = await tx.order.findUnique({ where: { id: e.pedidoId }, select: { estado: true, conversacionId: true, codigo: true } });
      if (!o || o.conversacionId !== conv.id) return fallo("El pedido no existe en esta conversación.");
      if (o.estado !== "borrador") return fallo("Este pedido ya se envió y no se puede editar aquí.");
      await actualizarContacto();
      await tx.orderItem.deleteMany({ where: { pedidoId: e.pedidoId } });
      await tx.order.update({ where: { id: e.pedidoId }, data: { ...datos, lineas: { create: lineas } } });
      return { ok: true as const, pedidoId: e.pedidoId, codigo: o.codigo, nuevo: false };
    }
    // Una cotización da para un solo pedido: si ya tiene uno en curso, se continúa ese (o se descarta para empezar otro).
    if (e.cotizacionId) {
      const otro = await tx.order.findFirst({ where: { cotizacionId: e.cotizacionId, estado: { notIn: ["cancelado", "vencido"] } }, select: { codigo: true } });
      if (otro) return fallo(`Esta cotización ya tiene el pedido ${otro.codigo}.`);
    }
    await actualizarContacto();
    const aj = await obtenerAjustesPedidos(tx);
    const { siguienteNumero } = await tx.ajustesPedidos.update({ where: { id: "pedidos" }, data: { siguienteNumero: { increment: 1 } }, select: { siguienteNumero: true } });
    const codigo = `${aj.prefijo}${String(siguienteNumero - 1).padStart(6, "0")}`;
    const o = await tx.order.create({
      data: {
        codigo, contactoId: conv.contactoId, conversacionId: conv.id, canal: conv.canal, creadoPorId: actor.id, cotizacionId: e.cotizacionId ?? null, ...datos,
        lineas: { create: lineas },
        eventos: { create: { aEstado: "borrador", usuarioId: actor.id, nota: "Pedido creado" } },
      },
    });
    return { ok: true as const, pedidoId: o.id, codigo, nuevo: true };
  });
  if (!r.ok) return r;
  if (r.nuevo) await log(actor, "crear_pedido", "Order", r.pedidoId, { codigo: r.codigo, total: p.total });
  return { ok: true, pedidoId: r.pedidoId, codigo: r.codigo };
}

export async function cargarBorrador(pedidoId: string, conversacionId: string): Promise<ResultadoPedido<{ entrada: EntradaPedido; productos: ProductoPedido[]; cotizacion: string | null }>> {
  const o = await db.order.findUnique({ where: { id: pedidoId }, include: { lineas: { orderBy: { id: "asc" } }, contacto: true, cotizacion: { select: { codigo: true } } } });
  if (!o || o.conversacionId !== conversacionId) return fallo("El pedido no existe en esta conversación.");
  if (o.estado !== "borrador") return fallo("Este pedido ya se envió y no se puede editar aquí.");
  const ids = o.lineas.flatMap((l) => (l.productoId ? [l.productoId] : []));
  const filas = await db.product.findMany({ where: { id: { in: ids }, activo: true }, include: CON_STOCK });
  const lineas = o.lineas.filter((l) => l.productoId && filas.some((p) => p.id === l.productoId));
  const [dir, ref] = (o.direccion ?? "").split(/\. Referencia: /);
  return {
    ok: true,
    cotizacion: o.cotizacion?.codigo ?? null,
    productos: lineas.map((l) => aProductoPedido(filas.find((p) => p.id === l.productoId)!)),
    entrada: {
      pedidoId: o.id, conversacionId, cotizacionId: o.cotizacionId,
      cliente: { nombre: o.contacto.nombre, telefono: o.contacto.telefono ? formatTelefono(o.contacto.telefono) : "", ...lugarGuardado(o.departamento ?? o.contacto.departamento, o.municipio ?? o.contacto.municipio) },
      lineas: lineas.map((l) => ({ productoId: l.productoId!, cantidad: l.cantidad, ubicacionId: l.ubicacionId })),
      entrega: o.entrega, direccion: dir ?? "", referencia: ref ?? "",
      descuento: o.descuentoMonto > 0 ? { tipo: "monto", valor: (o.descuentoMonto / 100).toFixed(2) } : null,
      descuentoMotivo: o.descuentoMotivo ?? "", notas: o.notas ?? "", metodoPago: o.metodoPago,
    },
  };
}

/** Un borrador que ya no se quiere: se cancela (no se borra, para que el consecutivo quede explicado). */
export async function descartarBorrador(pedidoId: string, actor: ActorPedidos): Promise<ResultadoPedido> {
  const r = await cambiarEstado({ pedidoId, a: "cancelado", quien: { usuarioId: actor.id }, nota: "Borrador descartado" });
  if (!r.ok) return r;
  await log(actor, "cancelar_pedido", "Order", pedidoId, { borrador: true });
  return { ok: true };
}

/* ── Enviar al cliente ── */

/**
 * El resumen tal como lo ve el cliente. El pie depende de la forma de pago del pedido (transferencia o depósito: las cuentas;
 * tarjeta: el enlace de pago abierto; efectivo: pagará al recoger) y usa los textos que el administrador dejó en Ajustes.
 */
export async function construirResumen(pedidoId: string): Promise<string> {
  const { configMensajes } = await import("./avisos"); // import dinámico: avisos.ts importa este archivo
  const [o, aj, negocio, cuentas, cfg, cobro] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: pedidoId }, include: { lineas: { orderBy: { id: "asc" } } } }),
    obtenerAjustesPedidos(),
    obtenerNegocio(),
    db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }] }),
    configMensajes(),
    db.cobroTarjeta.findFirst({ where: { pedidoId, estado: "creado" }, orderBy: { creado: "desc" }, select: { url: true } }),
  ]);
  const clave = o.metodoPago === "tarjeta" ? "resumen_tarjeta" : o.metodoPago === "efectivo_en_tienda" ? "resumen_efectivo" : o.metodoPago === "contra_entrega" ? "resumen_contra_entrega" : "resumen";
  const pie = rellenar(cfg[clave].texto, {
    cuentas: textoCuentas(cuentas) || aplicarDatos("{cuentas}", { ...negocio, cuentas: "" }),
    horas: textoHoras(aj.horasReserva), codigo: o.codigo, enlace: cobro?.url ?? "", total: formatQ(o.total),
  });
  return textoResumen({ codigo: o.codigo, lineas: o.lineas, descuentoMonto: o.descuentoMonto, costoEnvio: o.costoEnvio, total: o.total, entrega: o.entrega, departamento: o.departamento, municipio: o.municipio, direccionTienda: negocio.direccion }, pie);
}

/** Una línea gris en la conversación ("Pedido HO-000123 enviado al cliente por Ana"). */
export const lineaDeSistema = (actor: { id: string; nombre: string } | null, conversacionId: string, texto: string) =>
  db.activityLog.create({ data: { usuarioId: actor?.id, accion: "pedido", entidad: "Conversation", entidadId: conversacionId, detalle: { texto, por: actor?.nombre ?? "Sistema" } } });

/** ¿Se puede mandar el resumen por el canal de la conversación ahora mismo? */
export async function puedeEnviarPorCanal(conversacionId: string) {
  const c = await db.conversation.findUnique({ where: { id: conversacionId } });
  const canal = c ? adaptador(c.canal) : null;
  if (!c || !canal || !canal.canSendFreeForm(c)) return false;
  const quedan = await salientesRestantes(c); // en TikTok, con el tope de mensajes seguidos agotado tampoco se puede
  return quedan === null || quedan > 0;
}

/**
 * Pasa el borrador a «pendiente de pago» (aparta las existencias) y le manda el resumen al cliente.
 * Con modo «copiado» no lo manda: devuelve el texto para copiarlo y deja constancia de que salió fuera del sistema.
 */
export async function enviarAlCliente(pedidoId: string, actor: ActorPedidos, o: { modo: "enviar" | "copiado"; sobrePedido: boolean }): Promise<ResultadoPedido<{ texto: string }>> {
  const pedido = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, conversacionId: true, codigo: true, metodoPago: true, entrega: true, total: true, cotizacionId: true } });
  if (!pedido?.conversacionId) return fallo("El pedido no existe o no tiene conversación.");
  if (pedido.estado !== "borrador") return fallo("Este pedido ya se envió.");
  if (!pedido.metodoPago) return fallo("Elija la forma de pago del pedido antes de enviarlo al cliente.");
  const errorForma = errorDeForma(pedido.metodoPago, pedido.entrega, (await obtenerAjustesPedidos()).metodos);
  if (errorForma) return fallo(errorForma);
  if (o.sobrePedido && !puedeSobrePedido(actor)) return fallo("Solo un administrador o un jefe de tienda puede apartar «sobre pedido».");
  if (o.modo === "enviar" && !(await puedeEnviarPorCanal(pedido.conversacionId))) return fallo("Este canal no permite enviar mensajes ahora. Use «Copiar mensaje y marcar como enviado».");

  // Con tarjeta, el cobro se pide antes de apartar: si la pasarela no responde, no se aparta nada.
  if (pedido.metodoPago === "tarjeta") {
    const c = await abrirCobro({ pedidoId, codigo: pedido.codigo, monto: pedido.total, creadoPorId: actor.id });
    if (!c.ok) return fallo(c.error);
  }
  const r = await cambiarEstado({ pedidoId, a: "pendiente_pago", quien: { usuarioId: actor.id }, sobrePedido: o.sobrePedido, nota: o.modo === "copiado" ? "Resumen enviado fuera del sistema" : "Resumen enviado al cliente" });
  if (!r.ok) {
    await cancelarCobrosAbiertos(pedidoId); // no quedó apartado: el enlace no debe quedar vivo
    return r;
  }
  if (pedido.cotizacionId) await db.cotizacion.update({ where: { id: pedido.cotizacionId }, data: { estado: "aceptada" } }); // el cliente aceptó: ya es un pedido
  const texto = await construirResumen(pedidoId);
  await log(actor, "enviar_pedido", "Order", pedidoId, { codigo: pedido.codigo, modo: o.modo });

  if (o.modo === "copiado") {
    await lineaDeSistema(actor, pedido.conversacionId, `Resumen del pedido ${pedido.codigo} enviado fuera del sistema`);
    return { ok: true, texto };
  }
  const envio = await enviarMensaje({ conversacionId: pedido.conversacionId, usuarioId: actor.id, pedidoId, mensaje: { type: "text", text: texto } });
  if (!envio.ok) return fallo(`El pedido quedó apartado, pero el mensaje no se envió: ${envio.error}`);
  return { ok: true, texto };
}

/* ── Datos para abrir el panel ── */
export async function datosPanel(conversacionId: string, actor: ActorPedidos): Promise<ResultadoPedido<{ datos: DatosPanelPedido }>> {
  const conv = await db.conversation.findUnique({ where: { id: conversacionId }, include: { contacto: true } });
  if (!conv) return fallo("La conversación no existe.");
  const ahora = new Date();
  const [aj, ubicaciones, zonas, abiertos, cotizaciones, sugeridos] = await Promise.all([
    obtenerAjustesPedidos(),
    db.location.findMany({ where: { activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    listarZonas(),
    db.order.findMany({ where: { conversacionId, estado: { in: [...ABIERTOS] } }, orderBy: { creada: "desc" }, select: { id: true, codigo: true, estado: true, total: true, entrega: true } }),
    // Las que todavía se pueden convertir: sin pedido en curso, vigentes o vencidas hace menos de una semana (se convierten con los precios de hoy).
    db.cotizacion.findMany({
      where: { conversacionId, estado: "enviada", validaHasta: { gte: new Date(ahora.getTime() - 7 * 86_400_000) }, pedidos: { none: { estado: { notIn: ["cancelado", "vencido"] } } } },
      orderBy: { creada: "desc" }, take: 5, select: { id: true, codigo: true, total: true, estado: true, validaHasta: true },
    }),
    sugeridosDe(conversacionId),
  ]);
  return {
    ok: true,
    datos: {
      contacto: { nombre: conv.contacto.nombre, telefono: conv.contacto.telefono ? formatTelefono(conv.contacto.telefono) : "", ...lugarGuardado(conv.contacto.departamento, conv.contacto.municipio) },
      sinLimites: veTodo(actor),
      descuentoMaxAgente: aj.descuentoMaxAgente,
      inventario: aj.inventario,
      ubicaciones,
      ubicacionPorEntrega: { recoger: aj.ubicacionRecogerId, envio: aj.ubicacionEnvioId },
      envioGratisDesde: aj.envioGratisDesde,
      metodosPago: METODOS.filter((m) => m.disponible && aj.metodos.includes(m.id) && (m.id !== "tarjeta" || !!pasarela())).map((m) => ({ id: m.id, nombre: m.nombre })),
      zonas: zonas.filter((z) => z.activa).map((z) => ({ nombre: z.nombre, departamentos: z.departamentos, municipios: z.municipios, costo: z.costo, tiempo: z.tiempo })),
      abiertos,
      cotizaciones: cotizaciones.map((c) => ({ id: c.id, codigo: c.codigo, total: c.total, validaHasta: c.validaHasta.toISOString(), estado: estadoDeCotizacion(c, ahora) })),
      sugeridos,
    },
  };
}

/* ── Cambiar la forma de pago (el cliente cambió de idea con el pedido ya enviado) ── */

/**
 * Cambia la forma de pago de un pedido pendiente de pago y le manda al cliente el resumen nuevo. Al pasar a tarjeta abre el
 * cobro por el saldo; al salir de tarjeta anula el cobro abierto. Con un comprobante por verificar no se puede: primero se resuelve.
 */
export async function cambiarFormaDePago(pedidoId: string, metodo: TipoPago, actor: ActorPedidos): Promise<ResultadoPedido<{ aviso: ResultadoAviso }>> {
  const o = await db.order.findUnique({ where: { id: pedidoId }, select: { id: true, estado: true, codigo: true, conversacionId: true, metodoPago: true, entrega: true, total: true, subtotal: true, descuentoMonto: true, costoEnvio: true, departamento: true, municipio: true } });
  if (!o) return fallo("El pedido no existe.");
  if (o.estado !== "pendiente_pago") return fallo("Solo se puede cambiar la forma de pago de un pedido pendiente de pago.");
  if (o.metodoPago === metodo) return fallo("El pedido ya tiene esa forma de pago.");
  const aj = await obtenerAjustesPedidos();
  const error = errorDeForma(metodo, o.entrega, aj.metodos);
  if (error) return fallo(error);
  if (await db.payment.count({ where: { pedidoId, estado: "en_revision" } })) return fallo("Hay un comprobante por verificar. Resuélvalo antes de cambiar la forma de pago.");

  // El envío depende de la forma de pago (contra entrega cuesta; las demás, gratis): el total se vuelve a calcular.
  let costoEnvio = o.costoEnvio;
  if (o.entrega === "envio") {
    const zona = zonaPara(await listarZonas(), o.departamento, o.municipio);
    costoEnvio = zona ? costoSegunPago(aj, zona, o.subtotal, metodo) : metodo === "contra_entrega" ? aj.costoContraEntrega : aj.envioGratisSinContraEntrega ? 0 : o.costoEnvio;
  }
  const total = o.subtotal - o.descuentoMonto + costoEnvio;
  if (metodo === "tarjeta") {
    const verificado = (await db.payment.aggregate({ where: { pedidoId, estado: "verificado" }, _sum: { monto: true } }))._sum.monto ?? 0;
    const c = await abrirCobro({ pedidoId, codigo: o.codigo, monto: saldoDe(total, verificado), creadoPorId: actor.id });
    if (!c.ok) return fallo(c.error);
  }
  // Contra entrega no vence (se cobra al entregar); al salir de contra entrega vuelve a correr la reserva.
  const reservadoHasta = metodo === "contra_entrega" ? null : o.metodoPago === "contra_entrega" ? new Date(Date.now() + aj.horasReserva * 3_600_000) : undefined;
  await db.order.update({ where: { id: pedidoId }, data: { metodoPago: metodo, costoEnvio, total, ...(reservadoHasta !== undefined ? { reservadoHasta } : {}) } });
  if (o.metodoPago === "tarjeta") await cancelarCobrosAbiertos(pedidoId);
  await log(actor, "cambiar_forma_pago", "Order", pedidoId, { codigo: o.codigo, de: o.metodoPago, a: metodo });
  if (!o.conversacionId) return { ok: true, aviso: { estado: "sin-conversacion" } };
  await lineaDeSistema(actor, o.conversacionId, `${actor.nombre} cambió la forma de pago del pedido ${o.codigo} a ${nombreMetodo(metodo).toLowerCase()}`);

  const texto = await construirResumen(pedidoId);
  if (!(await puedeEnviarPorCanal(o.conversacionId))) return { ok: true, aviso: { estado: "copiar", texto } };
  const envio = await enviarMensaje({ conversacionId: o.conversacionId, usuarioId: actor.id, autor: "asesor", aviso: true, pedidoId, mensaje: { type: "text", text: texto } });
  return { ok: true, aviso: envio.ok ? { estado: "enviado", texto } : { estado: "fallo", texto, error: envio.error } };
}
