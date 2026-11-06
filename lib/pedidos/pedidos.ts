import { obtenerNegocio, log } from "@/lib/ajustes";
import { adaptador } from "@/lib/canales";
import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/dinero";
import { enviarMensaje } from "@/lib/mensajeria";
import { puedeDescontar, puedeSobrePedido } from "@/lib/permisos";
import { aplicarDatos, textoCuentas } from "@/lib/plantillas";
import { normalizarTelefono } from "@/lib/telefono";
import { formatTelefono } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { listarZonas, obtenerAjustesPedidos } from "./ajustes";
import { costoEnvio, zonaPara } from "./envio";
import { disponibleDe, disponibleProducto, apartadoProducto } from "./existencias";
import { cambiarEstado } from "./flujo";
import { MENSAJES, rellenar, textoHoras, textoResumen } from "./mensajes";
import { calcularTotales, type Descuento } from "./totales";
import type { DatosPanelPedido, EntradaPedido, ProductoPedido, ResultadoPedido, VistaPedido } from "./tipos";
import type { Rol } from "@/lib/permisos";
import { veTodo } from "@/lib/permisos";

export type ActorPedidos = { id: string; nombre: string; rol: Rol };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
const MAX_LINEAS = 40;
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

/* ── Validar y calcular (siempre en el servidor) ── */
async function preparar(e: EntradaPedido, actor: ActorPedidos) {
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
    return { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: p.precio, cantidad: l.cantidad, ubicacionId: l.ubicacionId };
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

  // Entrega
  const municipio = e.cliente.municipio.trim() || null;
  let zona: Awaited<ReturnType<typeof listarZonas>>[number] | null = null;
  let costo = 0;
  let direccion: string | null = null;
  if (e.entrega === "envio") {
    if (!municipio) return fallo("Escriba el municipio de entrega.");
    if (!e.direccion.trim()) return fallo("Escriba la dirección de entrega.");
    zona = zonaPara(await listarZonas(), municipio);
    if (!zona) return fallo(`No hay una zona de envío para ${municipio}. Agréguela en Ajustes → Pagos y envíos.`);
    costo = costoEnvio(zona, subtotal, aj.envioGratisDesde);
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

  if ((await db.bankAccount.count({ where: { activa: true } })) === 0) avisos.push("No hay cuentas bancarias activas: el resumen saldría sin cuentas. Agréguelas en Ajustes → Pagos y envíos.");

  return {
    ok: true as const,
    lineas, ...t, zona, direccion, municipio, avisos, sinExistencia,
    descuentoMotivo: t.descuentoMonto > 0 ? motivo : null,
    notas: e.notas.trim() || null,
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

/* ── Guardar borrador ── */
export async function guardarBorrador(e: EntradaPedido, actor: ActorPedidos): Promise<ResultadoPedido<{ pedidoId: string; codigo: string }>> {
  const conv = await db.conversation.findUnique({ where: { id: e.conversacionId }, select: { id: true, contactoId: true, canal: true } });
  if (!conv) return fallo("La conversación no existe.");

  const nombre = e.cliente.nombre.trim();
  if (!nombre) return fallo("Escriba el nombre del cliente.");
  if (nombre.length > 80) return fallo("El nombre del cliente pasa de 80 caracteres.");
  let telefono: string | undefined;
  if (e.cliente.telefono.trim()) {
    const t = normalizarTelefono(e.cliente.telefono);
    if (!t) return fallo("El teléfono no es válido. Use 8 dígitos, por ejemplo 5555 1234.");
    const otro = await db.contact.findUnique({ where: { telefono: t }, select: { id: true, nombre: true } });
    if (otro && otro.id !== conv.contactoId) return fallo(`Ese teléfono ya pertenece a ${otro.nombre}.`);
    telefono = t;
  }
  if (e.cliente.municipio.trim().length > 60) return fallo("El municipio pasa de 60 caracteres.");

  const p = await preparar(e, actor);
  if (!p.ok) return p;

  const datos = {
    entrega: e.entrega, direccion: p.direccion, municipio: p.municipio, zona: p.zona?.nombre ?? null, subtotal: p.subtotal, descuentoMonto: p.descuentoMonto,
    descuentoMotivo: p.descuentoMotivo, costoEnvio: p.costoEnvio, total: p.total, notas: p.notas,
  };
  const lineas = p.lineas.map((l) => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, ubicacionId: l.ubicacionId }));

  const r = await db.$transaction(async (tx) => {
    const actualizarContacto = () => tx.contact.update({ where: { id: conv.contactoId }, data: { nombre, ...(telefono ? { telefono } : {}), ...(p.municipio ? { municipio: p.municipio } : {}) } });

    if (e.pedidoId) {
      const o = await tx.order.findUnique({ where: { id: e.pedidoId }, select: { estado: true, conversacionId: true, codigo: true } });
      if (!o || o.conversacionId !== conv.id) return fallo("El pedido no existe en esta conversación.");
      if (o.estado !== "borrador") return fallo("Este pedido ya se envió y no se puede editar aquí.");
      await actualizarContacto();
      await tx.orderItem.deleteMany({ where: { pedidoId: e.pedidoId } });
      await tx.order.update({ where: { id: e.pedidoId }, data: { ...datos, lineas: { create: lineas } } });
      return { ok: true as const, pedidoId: e.pedidoId, codigo: o.codigo, nuevo: false };
    }
    await actualizarContacto();
    const aj = await obtenerAjustesPedidos(tx);
    const { siguienteNumero } = await tx.ajustesPedidos.update({ where: { id: "pedidos" }, data: { siguienteNumero: { increment: 1 } }, select: { siguienteNumero: true } });
    const codigo = `${aj.prefijo}${String(siguienteNumero - 1).padStart(6, "0")}`;
    const o = await tx.order.create({
      data: {
        codigo, contactoId: conv.contactoId, conversacionId: conv.id, canal: conv.canal, creadoPorId: actor.id, ...datos,
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

export async function cargarBorrador(pedidoId: string, conversacionId: string): Promise<ResultadoPedido<{ entrada: EntradaPedido; productos: ProductoPedido[] }>> {
  const o = await db.order.findUnique({ where: { id: pedidoId }, include: { lineas: { orderBy: { id: "asc" } }, contacto: true } });
  if (!o || o.conversacionId !== conversacionId) return fallo("El pedido no existe en esta conversación.");
  if (o.estado !== "borrador") return fallo("Este pedido ya se envió y no se puede editar aquí.");
  const ids = o.lineas.flatMap((l) => (l.productoId ? [l.productoId] : []));
  const filas = await db.product.findMany({ where: { id: { in: ids }, activo: true }, include: CON_STOCK });
  const lineas = o.lineas.filter((l) => l.productoId && filas.some((p) => p.id === l.productoId));
  const [dir, ref] = (o.direccion ?? "").split(/\. Referencia: /);
  return {
    ok: true,
    productos: lineas.map((l) => aProductoPedido(filas.find((p) => p.id === l.productoId)!)),
    entrada: {
      pedidoId: o.id, conversacionId,
      cliente: { nombre: o.contacto.nombre, telefono: o.contacto.telefono ? formatTelefono(o.contacto.telefono) : "", municipio: o.municipio ?? o.contacto.municipio ?? "" },
      lineas: lineas.map((l) => ({ productoId: l.productoId!, cantidad: l.cantidad, ubicacionId: l.ubicacionId })),
      entrega: o.entrega, direccion: dir ?? "", referencia: ref ?? "",
      descuento: o.descuentoMonto > 0 ? { tipo: "monto", valor: (o.descuentoMonto / 100).toFixed(2) } : null,
      descuentoMotivo: o.descuentoMotivo ?? "", notas: o.notas ?? "",
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

/** El resumen tal como lo ve el cliente, con las cuentas activas y los textos de Ajustes. */
export async function construirResumen(pedidoId: string): Promise<string> {
  const [o, aj, negocio, cuentas] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: pedidoId }, include: { lineas: { orderBy: { id: "asc" } } } }),
    obtenerAjustesPedidos(),
    obtenerNegocio(),
    db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }] }),
  ]);
  const pie = rellenar(MENSAJES.resumen.texto, {
    cuentas: textoCuentas(cuentas) || aplicarDatos("{cuentas}", { ...negocio, cuentas: "" }),
    horas: textoHoras(aj.horasReserva), codigo: o.codigo,
  });
  return textoResumen({ codigo: o.codigo, lineas: o.lineas, descuentoMonto: o.descuentoMonto, costoEnvio: o.costoEnvio, total: o.total, entrega: o.entrega, municipio: o.municipio, direccionTienda: negocio.direccion }, pie);
}

/** Una línea gris en la conversación ("Pedido HO-000123 enviado al cliente por Ana"). */
export const lineaDeSistema = (actor: { id: string; nombre: string } | null, conversacionId: string, texto: string) =>
  db.activityLog.create({ data: { usuarioId: actor?.id, accion: "pedido", entidad: "Conversation", entidadId: conversacionId, detalle: { texto, por: actor?.nombre ?? "Sistema" } } });

/** ¿Se puede mandar el resumen por el canal de la conversación ahora mismo? */
export async function puedeEnviarPorCanal(conversacionId: string) {
  const c = await db.conversation.findUnique({ where: { id: conversacionId } });
  const canal = c ? adaptador(c.canal) : null;
  return !!c && !!canal && canal.canSendFreeForm(c);
}

/**
 * Pasa el borrador a «pendiente de pago» (aparta las existencias) y le manda el resumen al cliente.
 * Con modo «copiado» no lo manda: devuelve el texto para copiarlo y deja constancia de que salió fuera del sistema.
 */
export async function enviarAlCliente(pedidoId: string, actor: ActorPedidos, o: { modo: "enviar" | "copiado"; sobrePedido: boolean }): Promise<ResultadoPedido<{ texto: string }>> {
  const pedido = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, conversacionId: true, codigo: true } });
  if (!pedido?.conversacionId) return fallo("El pedido no existe o no tiene conversación.");
  if (pedido.estado !== "borrador") return fallo("Este pedido ya se envió.");
  if (o.sobrePedido && !puedeSobrePedido(actor)) return fallo("Solo un administrador o un jefe de tienda puede apartar «sobre pedido».");
  if (o.modo === "enviar" && !(await puedeEnviarPorCanal(pedido.conversacionId))) return fallo("Este canal no permite enviar mensajes ahora. Use «Copiar mensaje y marcar como enviado».");

  const r = await cambiarEstado({ pedidoId, a: "pendiente_pago", quien: { usuarioId: actor.id }, sobrePedido: o.sobrePedido, nota: o.modo === "copiado" ? "Resumen enviado fuera del sistema" : "Resumen enviado al cliente" });
  if (!r.ok) return r;
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
  const [aj, ubicaciones, zonas, abiertos, sugeridos] = await Promise.all([
    obtenerAjustesPedidos(),
    db.location.findMany({ where: { activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    listarZonas(),
    db.order.findMany({ where: { conversacionId, estado: { in: [...ABIERTOS] } }, orderBy: { creada: "desc" }, select: { id: true, codigo: true, estado: true, total: true, entrega: true } }),
    sugeridosDe(conversacionId),
  ]);
  return {
    ok: true,
    datos: {
      contacto: { nombre: conv.contacto.nombre, telefono: conv.contacto.telefono ? formatTelefono(conv.contacto.telefono) : "", municipio: conv.contacto.municipio ?? "" },
      sinLimites: veTodo(actor),
      descuentoMaxAgente: aj.descuentoMaxAgente,
      inventario: aj.inventario,
      ubicaciones,
      ubicacionPorEntrega: { recoger: aj.ubicacionRecogerId, envio: aj.ubicacionEnvioId },
      envioGratisDesde: aj.envioGratisDesde,
      zonas: zonas.filter((z) => z.activa).map((z) => ({ nombre: z.nombre, municipios: z.municipios, costo: z.costo, tiempo: z.tiempo })),
      abiertos,
      sugeridos,
    },
  };
}
