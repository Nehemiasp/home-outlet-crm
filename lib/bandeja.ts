import { adaptador } from "@/lib/canales";
import { salientesRestantes } from "@/lib/mensajeria";
import type { Channel } from "@/lib/canales/tipos";
import { obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { textoLugar } from "@/lib/guatemala";
import { aplicarDatos } from "@/lib/plantillas";
import { obtenerAjustesPedidos, tiendaDeRecoger } from "@/lib/pedidos/ajustes";
import { comprasDeContacto } from "@/lib/pedidos/compras";
import { filtroConversacion, filtroPedido, type Actor } from "@/lib/visibilidad";
import { METODOS } from "@/lib/pedidos/metodos";
import { saldoDe } from "@/lib/pedidos/totales";
import type { Prisma } from "@/generated/prisma/client";
import type { Atencion, ContadoresLista, ConversacionDTO, Filtros, ItemLinea, ItemLista, ProductoDTO, TarjetaPedido, TonoSistema } from "@/lib/bandeja-tipos";
import { agruparLineas, textoRecoger } from "@/lib/pedidos/mensajes";
import { modoDePrueba } from "@/lib/ia/proveedor";
import type { Rol } from "@/lib/permisos";
import { veTodo } from "@/lib/permisos";
import { deAsesor, nombresAsignados } from "@/lib/equipo/compartida";

const NOMBRES_TIPO: Record<string, string> = {
  image: "Imagen", audio: "Audio", video: "Video", document: "Documento", location: "Ubicación", product: "Producto", unsupported: "Mensaje no compatible",
};
export const vistaPrevia = (m?: { texto: string | null; tipo: string; direccion: string }) =>
  m ? (m.direccion === "saliente" ? "Usted: " : "") + (m.texto?.trim() || NOMBRES_TIPO[m.tipo] || "Mensaje") : "Sin mensajes";

const atencionDe = (c: { atendidaPor: string; esperandoAsesorDesde: Date | null; estado: string; asignadaA?: { nombre: string } | null }): Atencion =>
  c.estado === "cerrada" ? "ninguna" : c.atendidaPor === "asistente" ? "asistente" : c.atendidaPor === "asesor" ? "asesor" : c.esperandoAsesorDesde ? "esperando" : "ninguna";

export async function listarConversaciones(f: Filtros, u: Actor): Promise<{ items: ItemLista[]; hayMas: boolean; contadores: ContadoresLista }> {
  const usuarioId = u.id;
  const visible = await filtroConversacion(u); // un asesor solo ve lo asignado a él, aunque pida otra pestaña
  const q = f.q.trim();
  const digitos = q.replace(/\D/g, "");
  const where: Prisma.ConversationWhereInput = {
    // «Mías» y el filtro «Asesor» incluyen las conversaciones en las que la persona participa (bandeja compartida). Van en el AND:
    // son un OR, y la búsqueda de abajo también lo es; sueltos, uno pisaría al otro.
    AND: [visible, ...(f.tab === "mias" ? [deAsesor(usuarioId)] : []), ...(veTodo(u) && f.asesor !== "todos" && f.asesor !== "sin" ? [deAsesor(f.asesor)] : [])],
    ...(f.tab === "sin-asignar" || (veTodo(u) && f.asesor === "sin") ? { asignadaAId: null } : {}),
    ...(f.estado !== "todos" ? { estado: f.estado } : {}),
    ...(f.canal !== "todos" ? { canal: f.canal } : {}),
    ...(f.atencion === "asistente" ? { atendidaPor: "asistente" as const } : f.atencion === "esperando" ? { atendidaPor: "nadie" as const, esperandoAsesorDesde: { not: null }, estado: { not: "cerrada" as const } } : {}),
    ...(q
      ? {
          OR: [
            { contacto: { nombre: { contains: q, mode: "insensitive" } } },
            ...(digitos.length >= 3 ? [{ contacto: { telefono: { contains: digitos } } }] : []),
            { mensajes: { some: { texto: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const filas = await db.conversation.findMany({
    where,
    // Como en WhatsApp: la conversación con el último mensaje (enviado o recibido) va arriba.
    orderBy: { lastMessageAt: "desc" },
    take: f.limite + 1,
    include: { asignadaA: { select: { nombre: true } }, _count: { select: { participantes: true } }, contacto: { select: { nombre: true } }, mensajes: { orderBy: { fecha: "desc" }, take: 1, select: { texto: true, tipo: true, direccion: true } } },
  });
  const [sinAsignar, mias] = await Promise.all([
    db.conversation.count({ where: { estado: { not: "cerrada" }, asignadaAId: null, ...visible } }),
    db.conversation.count({ where: { estado: { not: "cerrada" }, ...deAsesor(usuarioId) } }),
  ]);
  return {
    contadores: { sinAsignar, mias },
    hayMas: filas.length > f.limite,
    items: filas.slice(0, f.limite).map((c) => ({
      id: c.id, nombre: c.contacto.nombre, canal: c.canal, ultimo: vistaPrevia(c.mensajes[0]), hora: c.lastMessageAt.toISOString(), noLeidos: c.noLeidos, estado: c.estado, atencion: atencionDe(c), asesor: c.asignadaA?.nombre ?? null,
      asignados: Math.max(c._count.participantes, c.asignadaA ? 1 : 0),
    })),
  };
}

/** No leídos más las conversaciones que esperan asesor y todavía no tienen mensajes sin leer (para no contar dos veces). */
export async function contarNoLeidos(u: Actor) {
  const visible = await filtroConversacion(u);
  const [{ _sum }, esperando] = await Promise.all([
    db.conversation.aggregate({ _sum: { noLeidos: true }, where: { estado: { not: "cerrada" }, ...visible } }),
    db.conversation.count({ where: { estado: { not: "cerrada" }, atendidaPor: "nadie", esperandoAsesorDesde: { not: null }, noLeidos: 0, ...visible } }),
  ]);
  return (_sum.noLeidos ?? 0) + esperando;
}

/** Color e ícono de una línea de sistema según lo que pasó. */
const tonoActividad = (accion: string, texto: string): TonoSistema => {
  if (accion.startsWith("asistente")) return "info";
  if (accion === "asignar") return /automáticamente|porque/.test(texto) ? "info" : /devolvió|Sin asignar/.test(texto) ? "aviso" : "neutro";
  if (accion !== "pedido") return "neutro";
  const t = texto.toLowerCase();
  if (/venci|cancel|rechaz/.test(t)) return "peligro";
  if (/verificad|confirmad|pagado|entregado|comprobante/.test(t)) return "exito";
  if (/revisi|por verificar|enviado fuera|espera/.test(t)) return "aviso";
  return "neutro";
};

type DetalleActividad = { a?: string | null; de?: string | null; estado?: string; por?: string; motivo?: string; texto?: string; tipo?: string };

const textoActividad = (accion: string, d: DetalleActividad) => {
  if (accion === "pedido") return d.texto ?? null;
  if (accion === "asignar" && d.tipo) {
    // Cada asignación del equipo queda a la vista en la conversación.
    if (d.tipo === "automatica" || d.tipo === "cola") return `Asignada a ${d.a} automáticamente`;
    if (d.tipo === "respuesta") return `Asignada a ${d.a} al responder`;
    if (d.tipo === "se_suma") return `${d.a} se sumó a la conversación`;
    if (d.tipo === "reparto") return `Reasignada a ${d.a}${d.de ? ` porque ${d.de} no estaba disponible` : ""} · Por ${d.por}`;
    if (d.tipo === "reasignar") return `${d.por} reasignó la conversación${d.de ? ` de ${d.de}` : ""} a ${d.a}`;
    if (d.tipo === "devolver") return `${d.por} devolvió la conversación a la cola${d.motivo ? ` · Motivo: ${d.motivo}` : ""}`;
    if (d.tipo === "sin_asesor") return `Quedó en «Sin asignar»: no hay ningún asesor disponible${d.de ? ` (era de ${d.de})` : ""}`;
  }
  if (accion === "asistente_paso") return `El asistente pasó la conversación a un asesor · Motivo: ${d.motivo ?? "sin motivo"}`;
  if (accion === "asistente_devuelto") return `${d.por} devolvió la conversación al asistente`;
  if (accion === "asistente_pausado") return `${d.por} desactivó al asistente en esta conversación`;
  if (accion === "asignar") return d.a ? `Conversación asignada a ${d.a} por ${d.por}` : `${d.por} quitó la asignación`;
  if (accion === "estado") return d.estado === "cerrada" ? `Conversación cerrada por ${d.por}` : `${d.por} marcó la conversación como ${d.estado === "pendiente" ? "pendiente" : "abierta"}`;
  return null;
};

/** Carga todo lo que necesitan la conversación y el panel del contacto. Abrirla la marca como leída. */
export async function cargarConversacion(id: string, yo: { id: string; rol: Rol }): Promise<ConversacionDTO | null> {
  const visible = await filtroConversacion(yo);
  const conv = await db.conversation.findFirst({
    where: { id, ...visible },
    include: {
      asignadaA: { select: { id: true, nombre: true } },
      participantes: { select: { desde: true, usuario: { select: { id: true, nombre: true } } } },
      contacto: { include: { etiquetas: true, identidades: true } },
      mensajes: { orderBy: { fecha: "desc" }, take: 200, include: { producto: true, enviadoPor: { select: { nombre: true } }, aiRun: { select: { consultado: true } } } },
      resumenes: { orderBy: { creado: "desc" }, take: 1 },
      notas: { orderBy: { fecha: "desc" }, take: 100, include: { autor: { select: { nombre: true } } } },
    },
  });
  if (!conv) return null;
  if (conv.noLeidos > 0) await db.conversation.update({ where: { id }, data: { noLeidos: 0 } });

  const [otras, actividad, usuarios, etiquetas, respuestas, negocio, ajustesPedidos, abiertos, cuentas] = await Promise.all([
    db.conversation.findMany({
      where: { contactoId: conv.contactoId, id: { not: id }, ...visible },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
      include: { mensajes: { orderBy: { fecha: "desc" }, take: 1, select: { texto: true, tipo: true, direccion: true } } },
    }),
    db.activityLog.findMany({ where: { entidad: "Conversation", entidadId: id, accion: { in: ["asignar", "estado", "asistente_paso", "asistente_devuelto", "asistente_pausado", "pedido"] } }, orderBy: { fecha: "desc" }, take: 50 }),
    veTodo(yo) ? db.user.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }) : Promise.resolve([]),
    db.tag.findMany({ orderBy: { nombre: "asc" } }),
    db.quickReply.findMany({ orderBy: { atajo: "asc" }, select: { atajo: true, texto: true } }),
    obtenerNegocio(),
    obtenerAjustesPedidos(),
    db.order.findMany({ where: { conversacionId: id, estado: { in: ["pendiente_pago", "en_revision"] } }, orderBy: { creada: "desc" }, select: { id: true, codigo: true, estado: true, total: true, pagos: { select: { monto: true, estado: true } } } }),
    db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }], select: { banco: true } }),
  ]);

  // Los mensajes que son el resumen de un pedido se dibujan como tarjeta (el texto plano sigue siendo el que ve el cliente).
  const idsPedido = [...new Set(conv.mensajes.flatMap((m) => (m.pedidoId ? [m.pedidoId] : [])))];
  const pedidosDeMensajes = idsPedido.length
    ? await db.order.findMany({ where: { id: { in: idsPedido } }, include: { lineas: { orderBy: { id: "asc" } }, recogerEn: { select: { nombre: true, direccion: true } } } })
    : [];
  // Los pedidos de antes no dicen tienda: recogen en la de Ajustes.
  const tiendaPorDefecto = pedidosDeMensajes.some((o) => o.entrega === "recoger" && !o.recogerEn) ? await tiendaDeRecoger(null) : null;
  const cuentasActivas = pedidosDeMensajes.length ? await db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }], select: { banco: true, tipo: true, numero: true, titular: true } }) : [];
  // El enlace de pago abierto de los pedidos que se pagan con tarjeta.
  const cobrosAbiertos = pedidosDeMensajes.length ? await db.cobroTarjeta.findMany({ where: { pedidoId: { in: pedidosDeMensajes.map((o) => o.id) }, estado: "creado" }, orderBy: { creado: "asc" }, select: { pedidoId: true, url: true } }) : [];
  const enlaceDe = (pedidoId: string) => cobrosAbiertos.filter((c) => c.pedidoId === pedidoId).at(-1)?.url ?? null;
  const tarjetas = new Map<string, TarjetaPedido>(
    pedidosDeMensajes.map((o) => [
      o.id,
      {
        id: o.id, codigo: o.codigo, estado: o.estado,
        lineas: agruparLineas(o.lineas).map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, total: l.precio * l.cantidad })),
        descuento: o.descuentoMonto,
        envio: o.entrega === "envio" ? `Envío a ${textoLugar(o.municipio, o.departamento) || "su municipio"}${o.costoEnvio === 0 ? " · Gratis" : ""}` : textoRecoger(o.recogerEn ?? tiendaPorDefecto),
        total: o.total,
        // las cuentas solo van si se paga por banco (o si el pedido es anterior a la forma de pago)
        cuentas: o.metodoPago === null || o.metodoPago === "transferencia" || o.metodoPago === "deposito" ? cuentasActivas : [],
        formaPago: o.metodoPago,
        enlace: o.metodoPago === "tarjeta" ? enlaceDe(o.id) : null,
      },
    ]),
  );
  const tarjetaDe = (m: { pedidoId: string | null; texto: string | null }) => {
    const t = m.pedidoId ? tarjetas.get(m.pedidoId) : undefined;
    return t && m.texto?.startsWith(`Pedido ${t.codigo}\n`) ? t : null;
  };

  // La tarjeta muestra la foto con la que salió (se puede elegir otra que la principal); los mensajes de antes no la guardaban.
  const producto = (p: (typeof conv.mensajes)[number]["producto"], foto: string | null): ProductoDTO | null =>
    p ? { id: p.id, nombre: p.nombre, sku: p.sku, precioCentavos: p.precio, imagenUrl: foto ?? p.imagenes[0] } : null;

  const linea: ItemLinea[] = [
    ...conv.mensajes.map((m): ItemLinea => ({
      clase: "mensaje", id: m.id, entrante: m.direccion === "entrante", tipo: m.tipo, texto: m.texto, archivoUrl: m.archivoUrl, producto: producto(m.producto, m.archivoUrl),
      estado: m.estado, autor: m.enviadoPor?.nombre ?? null, quien: m.autor, consultado: m.aiRun?.consultado ?? [], pedido: tarjetaDe(m), fecha: m.fecha.toISOString(),
    })),
    ...conv.notas.map((n): ItemLinea => ({ clase: "nota", id: n.id, texto: n.texto, autor: n.autor.nombre, fecha: n.fecha.toISOString() })),
    ...actividad.flatMap((a): ItemLinea[] => {
      const texto = textoActividad(a.accion, (a.detalle ?? {}) as DetalleActividad);
      return texto ? [{ clase: "sistema", id: a.id, texto, tono: tonoActividad(a.accion, texto), fecha: a.fecha.toISOString() }] : [];
    }),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const asignadas = new Set(conv.contacto.etiquetas.map((t) => t.id));
  return {
    id: conv.id,
    canal: conv.canal as Channel,
    estado: conv.estado,
    atencion: atencionDe(conv),
    motivo: conv.motivo,
    resumen: conv.resumenes[0] ? { texto: conv.resumenes[0].texto, creado: conv.resumenes[0].creado.toISOString() } : null,
    modoDePrueba: modoDePrueba(),
    asignadaA: conv.asignadaA,
    asignados: nombresAsignados(conv),
    lastInboundAt: conv.lastInboundAt?.toISOString() ?? null,
    canalActivo: adaptador(conv.canal) !== null,
    salientesRestantes: await salientesRestantes(conv),
    linea,
    contacto: {
      id: conv.contacto.id, nombre: conv.contacto.nombre, telefono: conv.contacto.telefono, correo: conv.contacto.correo, notas: conv.contacto.notas,
      etiquetas: conv.contacto.etiquetas,
      identidades: conv.contacto.identidades.map((i) => ({ canal: i.canal as Channel, alias: i.alias, externalContactId: i.externalContactId })),
    },
    historial: otras.map((o) => ({ id: o.id, canal: o.canal as Channel, estado: o.estado, fecha: o.lastMessageAt.toISOString(), ultimo: vistaPrevia(o.mensajes[0]) })),
    etiquetasDisponibles: etiquetas.filter((t) => !asignadas.has(t.id)),
    respuestasRapidas: respuestas.map((r) => ({ atajo: r.atajo, texto: aplicarDatos(r.texto, negocio) })),
    usuarios,
    yo,
    compras: await comprasDeContacto(conv.contactoId, await filtroPedido(yo)),
    pedidosAbiertos: abiertos.map((o) => ({ id: o.id, codigo: o.codigo, estado: o.estado, total: o.total, saldo: saldoDe(o.total, o.pagos.filter((p) => p.estado === "verificado").reduce((t, p) => t + p.monto, 0)) })),
    comprobante: { metodos: METODOS.filter((m) => ajustesPedidos.metodos.includes(m.id)).map((m) => ({ id: m.id, nombre: m.nombre })), bancos: [...new Set(cuentas.map((c) => c.banco))] },
  };
}
