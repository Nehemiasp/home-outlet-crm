import { log, obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { lugarGuardado } from "@/lib/guatemala";
import { enviarMensaje } from "@/lib/mensajeria";
import { formatTelefono } from "@/lib/utils";
import { filtroCotizacion, puedeVerCotizacion, type Actor } from "@/lib/visibilidad";
import type { EstadoPedido } from "@/generated/prisma/client";
import { obtenerAjustesPedidos } from "./ajustes";
import { configMensajes } from "./avisos";
import { rellenar, textoResumen } from "./mensajes";
import { aProductoPedido, clienteDelPanel, lineaDeSistema, prepararPedido, puedeEnviarPorCanal, type ActorPedidos } from "./pedidos";
import type { CotizacionAbierta, EntradaPedido, EstadoCotizacionVista, ProductoPedido, ResultadoPedido } from "./tipos";
import { estadoDeCotizacion, finDeVigencia, textoFecha } from "./vigencia";

/**
 * Cotizaciones: el mismo armado del panel de pedido (productos, entrega, descuento y totales calculados en el servidor), pero sin
 * apartar existencias ni pedir pago. Valen unos días (Ajustes → Pagos y envíos); si el cliente acepta, «Convertir en pedido»
 * abre el panel con lo cotizado y el pedido respeta esos precios (ver `preciosDeCotizacion` en pedidos.ts).
 */

const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
const EN_CURSO: { notIn: EstadoPedido[] } = { notIn: ["cancelado", "vencido"] }; // un pedido cancelado o vencido deja la cotización libre

/** El mensaje que recibe el cliente: las líneas y los totales, como el resumen del pedido, y el pie con la vigencia (editable en Ajustes). */
export async function textoDeCotizacion(cotizacionId: string): Promise<string> {
  const [c, negocio, cfg] = await Promise.all([db.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId }, include: { lineas: { orderBy: { id: "asc" } } } }), obtenerNegocio(), configMensajes()]);
  const pie = rellenar(cfg.cotizacion.texto, { codigo: c.codigo, vence: textoFecha(c.validaHasta) });
  return textoResumen({ codigo: c.codigo, lineas: c.lineas, descuentoMonto: c.descuentoMonto, costoEnvio: c.costoEnvio, total: c.total, entrega: c.entrega, departamento: c.departamento, municipio: c.municipio, direccionTienda: negocio.direccion }, pie, "Cotización");
}

/**
 * Guarda lo que hay en el panel como cotización y se la manda al cliente. No aparta nada, así que tampoco pide forma de pago ni
 * que alcance la existencia. Con modo «copiado» no la manda: devuelve el texto para pegarlo en el canal.
 */
export async function enviarCotizacion(e: EntradaPedido, actor: ActorPedidos, modo: "enviar" | "copiado"): Promise<ResultadoPedido<{ cotizacionId: string; codigo: string; texto: string }>> {
  if (e.cotizacionId) return fallo("Esto ya sale de una cotización: envíelo como pedido.");
  const conv = await db.conversation.findUnique({ where: { id: e.conversacionId }, select: { id: true, contactoId: true, canal: true } });
  if (!conv) return fallo("La conversación no existe.");
  const cliente = await clienteDelPanel(e, conv.contactoId);
  if (!cliente.ok) return cliente;
  const p = await prepararPedido({ ...e, metodoPago: null }, actor); // la forma de pago se elige al hacer el pedido
  if (!p.ok) return p;
  if (modo === "enviar" && !(await puedeEnviarPorCanal(conv.id))) return fallo("Este canal no permite enviar mensajes ahora. Use «Copiar cotización».");

  const aj = await obtenerAjustesPedidos(); // también crea la fila de ajustes si no existe
  const validaHasta = finDeVigencia(new Date(), aj.diasCotizacion);
  // En el pedido una línea se parte por ubicación; aquí no hay ubicación: una línea por producto.
  const lineas = new Map<string, { productoId: string; sku: string; nombre: string; precio: number; cantidad: number }>();
  for (const l of p.lineas) {
    const previa = lineas.get(l.productoId);
    if (previa) previa.cantidad += l.cantidad;
    else lineas.set(l.productoId, { productoId: l.productoId, sku: l.sku, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad });
  }

  const c = await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: conv.contactoId }, data: { nombre: cliente.nombre, ...(cliente.telefono ? { telefono: cliente.telefono } : {}), ...(p.municipio ? { departamento: p.departamento, municipio: p.municipio } : {}) } });
    const { siguienteCotizacion } = await tx.ajustesPedidos.update({ where: { id: "pedidos" }, data: { siguienteCotizacion: { increment: 1 } }, select: { siguienteCotizacion: true } });
    return tx.cotizacion.create({
      data: {
        codigo: `COT-${String(siguienteCotizacion - 1).padStart(6, "0")}`, contactoId: conv.contactoId, conversacionId: conv.id, canal: conv.canal, creadoPorId: actor.id, validaHasta,
        entrega: e.entrega, direccion: p.direccion, departamento: p.departamento, municipio: p.municipio, zona: p.zona?.nombre ?? null,
        subtotal: p.subtotal, descuentoMonto: p.descuentoMonto, descuentoMotivo: p.descuentoMotivo, costoEnvio: p.costoEnvio, total: p.total, notas: p.notas,
        lineas: { create: [...lineas.values()] },
      },
      select: { id: true, codigo: true },
    });
  });
  await log(actor, "crear_cotizacion", "Cotizacion", c.id, { codigo: c.codigo, total: p.total });
  const texto = await textoDeCotizacion(c.id);
  const vence = `vale hasta el ${textoFecha(validaHasta)}`;

  if (modo === "copiado") {
    await lineaDeSistema(actor, conv.id, `Cotización ${c.codigo} enviada fuera del sistema · ${vence}`);
    return { ok: true, cotizacionId: c.id, codigo: c.codigo, texto };
  }
  const envio = await enviarMensaje({ conversacionId: conv.id, usuarioId: actor.id, mensaje: { type: "text", text: texto } });
  if (!envio.ok) return fallo(`La cotización ${c.codigo} quedó guardada, pero el mensaje no se envió: ${envio.error} Puede copiarla desde Pedidos → Cotizaciones.`);
  await lineaDeSistema(actor, conv.id, `Cotización ${c.codigo} enviada al cliente · ${vence}`);
  return { ok: true, cotizacionId: c.id, codigo: c.codigo, texto };
}

/**
 * Lo cotizado, listo para el panel de pedido: los mismos productos, cantidades, entrega y descuento, ligado a la cotización para
 * que el pedido respete sus precios. La forma de pago se elige ahora. Los productos que ya no están en el catálogo se quedan fuera.
 */
export async function cargarParaConvertir(cotizacionId: string, conversacionId: string): Promise<ResultadoPedido<{ entrada: EntradaPedido; productos: ProductoPedido[]; cotizacion: string; aviso: string | null }>> {
  const c = await db.cotizacion.findUnique({ where: { id: cotizacionId }, include: { lineas: { orderBy: { id: "asc" } }, contacto: true, pedidos: { where: { estado: EN_CURSO }, select: { codigo: true } } } });
  if (!c || c.conversacionId !== conversacionId) return fallo("La cotización no existe en esta conversación.");
  if (c.estado === "aceptada") return fallo(`La cotización ${c.codigo} ya se convirtió en pedido.`);
  if (c.pedidos[0]) return fallo(`Esta cotización ya tiene el pedido ${c.pedidos[0].codigo}. Continúelo desde «Crear pedido».`);

  const ids = c.lineas.flatMap((l) => (l.productoId ? [l.productoId] : []));
  const filas = await db.product.findMany({ where: { id: { in: ids }, activo: true }, include: { stock: { include: { ubicacion: true } } } });
  const lineas = c.lineas.filter((l) => l.productoId && filas.some((p) => p.id === l.productoId));
  const fuera = c.lineas.length - lineas.length;
  const vencida = estadoDeCotizacion(c) === "vencida";
  const aviso = [fuera ? `${fuera === 1 ? "Un producto" : `${fuera} productos`} de la cotización ya no ${fuera === 1 ? "está" : "están"} en el catálogo.` : "", vencida ? "La cotización ya venció: el pedido lleva los precios de hoy." : ""].filter(Boolean).join(" ") || null;
  const [dir, ref] = (c.direccion ?? "").split(/\. Referencia: /);
  return {
    ok: true,
    cotizacion: c.codigo,
    aviso,
    productos: lineas.map((l) => aProductoPedido(filas.find((p) => p.id === l.productoId)!)),
    entrada: {
      pedidoId: null, conversacionId, cotizacionId: c.id,
      cliente: { nombre: c.contacto.nombre, telefono: c.contacto.telefono ? formatTelefono(c.contacto.telefono) : "", ...lugarGuardado(c.departamento ?? c.contacto.departamento, c.municipio ?? c.contacto.municipio) },
      lineas: lineas.map((l) => ({ productoId: l.productoId!, cantidad: l.cantidad, ubicacionId: null })),
      entrega: c.entrega, direccion: dir ?? "", referencia: ref ?? "",
      descuento: c.descuentoMonto > 0 ? { tipo: "monto", valor: (c.descuentoMonto / 100).toFixed(2) } : null,
      descuentoMotivo: c.descuentoMotivo ?? "", notas: c.notas ?? "", metodoPago: null,
    },
  };
}

/* ── Lista y detalle (Pedidos → Cotizaciones) ── */

export type FilaCotizacion = CotizacionAbierta & { cliente: string; contactoId: string; fecha: string; pedido: { id: string; codigo: string } | null };

export async function listarCotizaciones(f: { q: string; limite: number }, u: Actor): Promise<{ items: FilaCotizacion[]; hayMas: boolean }> {
  const q = f.q.trim();
  const digitos = q.replace(/\D/g, "");
  const filas = await db.cotizacion.findMany({
    where: {
      AND: [await filtroCotizacion(u)],
      ...(q ? { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { contacto: { nombre: { contains: q, mode: "insensitive" } } }, ...(digitos.length >= 3 ? [{ contacto: { telefono: { contains: digitos } } }] : [])] } : {}),
    },
    orderBy: { creada: "desc" },
    take: f.limite + 1,
    select: { id: true, codigo: true, contactoId: true, creada: true, validaHasta: true, estado: true, total: true, contacto: { select: { nombre: true } }, pedidos: { where: { estado: EN_CURSO }, orderBy: { creada: "desc" }, take: 1, select: { id: true, codigo: true } } },
  });
  const ahora = new Date();
  return {
    hayMas: filas.length > f.limite,
    items: filas.slice(0, f.limite).map((c) => ({
      id: c.id, codigo: c.codigo, cliente: c.contacto.nombre, contactoId: c.contactoId, fecha: c.creada.toISOString(), validaHasta: c.validaHasta.toISOString(), total: c.total,
      estado: estadoDeCotizacion(c, ahora), pedido: c.pedidos[0] ?? null,
    })),
  };
}


export type DetalleCotizacion = {
  id: string;
  codigo: string;
  estado: EstadoCotizacionVista;
  creada: string;
  validaHasta: string;
  creadoPor: string | null;
  conversacionId: string | null;
  cliente: { id: string; nombre: string; telefono: string | null };
  entrega: "recoger" | "envio";
  direccion: string | null;
  departamento: string | null;
  municipio: string | null;
  lineas: { id: string; sku: string; nombre: string; precio: number; cantidad: number }[];
  subtotal: number;
  descuentoMonto: number;
  costoEnvio: number;
  total: number;
  notas: string | null;
  pedido: { id: string; codigo: string } | null;
  negocio: { nombre: string; direccion: string | null; horario: string | null };
  /** El mensaje tal como lo recibió (o lo recibiría) el cliente, para copiarlo otra vez. */
  texto: string;
};

export async function detalleCotizacion(id: string, u: Actor): Promise<DetalleCotizacion | null> {
  if (!(await puedeVerCotizacion(u, id))) return null; // lo ajeno, igual que lo que no existe
  const [c, negocio, texto] = await Promise.all([
    db.cotizacion.findUniqueOrThrow({
      where: { id },
      include: { lineas: { orderBy: { id: "asc" } }, contacto: { select: { id: true, nombre: true, telefono: true } }, creadoPor: { select: { nombre: true } }, pedidos: { where: { estado: EN_CURSO }, orderBy: { creada: "desc" }, take: 1, select: { id: true, codigo: true } } },
    }),
    obtenerNegocio(),
    textoDeCotizacion(id),
  ]);
  return {
    id: c.id, codigo: c.codigo, estado: estadoDeCotizacion(c), creada: c.creada.toISOString(), validaHasta: c.validaHasta.toISOString(), creadoPor: c.creadoPor?.nombre ?? null, conversacionId: c.conversacionId,
    cliente: { id: c.contacto.id, nombre: c.contacto.nombre, telefono: c.contacto.telefono },
    entrega: c.entrega, direccion: c.direccion, departamento: c.departamento, municipio: c.municipio,
    lineas: c.lineas.map((l) => ({ id: l.id, sku: l.sku, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
    subtotal: c.subtotal, descuentoMonto: c.descuentoMonto, costoEnvio: c.costoEnvio, total: c.total, notas: c.notas,
    pedido: c.pedidos[0] ?? null, negocio: { nombre: negocio.nombre, direccion: negocio.direccion, horario: negocio.horario }, texto,
  };
}
