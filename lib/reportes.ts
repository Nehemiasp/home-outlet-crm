import { db } from "@/lib/db";
import { CANALES, canalesDeReporte, type Channel } from "@/lib/canales/tipos";
import { estadoPresupuesto } from "@/lib/ia/ajustes-ia";
import { ETIQUETA_MOTIVO, type MotivoIa } from "@/lib/ia/tipos";
import { ETIQUETA_ESTADO } from "@/lib/pedidos/estados";
import type { EstadoPedido, Prisma } from "@/generated/prisma/client";

export type FiltrosReporte = { desde: string; hasta: string; canal: "todos" | Channel };

export type Reportes = {
  rango: { desde: string; hasta: string; dias: number };
  indicadores: { nuevas: number; medianaAsistenteSeg: number | null; medianaAsesorSeg: number | null; resueltasPct: number | null; atendidasPorAsistente: number; esperandoAhora: number };
  canales: Channel[];
  porDia: { fecha: string; etiqueta: string; porCanal: Record<string, number> }[];
  motivos: { motivo: string; etiqueta: string; total: number }[];
  productos: { id: string; nombre: string; consultas: number; existencia: number }[];
  porHora: number[];
  costoPorDia: { fecha: string; etiqueta: string; costo: number }[];
  costoMes: { mes: string; dias: { fecha: string; etiqueta: string; acumulado: number }[]; gasto: number; presupuesto: number };
  ventas: Ventas;
};

/** Ventas de pedidos. Los montos van en centavos. Una venta cuenta el día en que se confirmó su pago. */
export type Ventas = {
  indicadores: { pedidos: number; ventas: number; ticketPromedio: number | null; conversionPct: number | null; porVerificar: number; vencidos: number; medianaVerificacionSeg: number | null };
  canales: Channel[];
  porDia: { fecha: string; etiqueta: string; porCanal: Record<string, number> }[];
  porEstado: { estado: EstadoPedido; etiqueta: string; total: number }[];
  productos: { nombre: string; unidades: number; monto: number }[];
};

const HORA = 3_600_000;
const DIA = 24 * HORA;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Los días se cuentan en hora de Guatemala (UTC-6, sin horario de verano). */
const claveDia = (d: Date) => new Date(d.getTime() - 6 * HORA).toISOString().slice(0, 10);
const horaLocal = (d: Date) => (d.getUTCHours() + 18) % 24;
const etiquetaDia = (clave: string) => new Date(`${clave}T12:00:00-06:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", timeZone: "America/Guatemala" }).replace(".", "");
const inicioDe = (clave: string) => new Date(`${clave}T00:00:00-06:00`);
const dias = (desde: string, hasta: string) => Math.round((inicioDe(hasta).getTime() - inicioDe(desde).getTime()) / DIA) + 1;

const mediana = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function validarFiltros(f: FiltrosReporte): string | null {
  if (!FECHA.test(f.desde) || !FECHA.test(f.hasta) || Number.isNaN(inicioDe(f.desde).getTime()) || Number.isNaN(inicioDe(f.hasta).getTime())) return "Las fechas no son válidas.";
  if (f.desde > f.hasta) return "La fecha de inicio debe ser antes que la final.";
  if (dias(f.desde, f.hasta) > 366) return "El rango más largo es de un año.";
  if (f.canal !== "todos" && !(canalesDeReporte() as readonly string[]).includes(f.canal)) return "El canal no es válido.";
  return null;
}

export async function generarReportes(f: FiltrosReporte): Promise<Reportes> {
  const inicio = inicioDe(f.desde);
  const fin = new Date(inicioDe(f.hasta).getTime() + DIA);
  const rango = { gte: inicio, lt: fin };
  const canal = f.canal === "todos" ? undefined : f.canal;
  const sinSimulado = canalesDeReporte().length < CANALES.length;
  const porCanalConv: Prisma.ConversationWhereInput = canal ? { canal } : sinSimulado ? { canal: { not: "simulado" } } : {};

  const nuevas = await db.conversation.findMany({ where: { creada: rango, ...porCanalConv }, select: { id: true, canal: true, creada: true, motivo: true } });
  const ids = nuevas.map((c) => c.id);

  const [mensajes, pasos, esperandoAhora, entrantes, corridas, enviados] = await Promise.all([
    ids.length ? db.message.findMany({ where: { conversacionId: { in: ids } }, orderBy: { fecha: "asc" }, select: { conversacionId: true, direccion: true, autor: true, fecha: true } }) : [],
    ids.length ? db.activityLog.findMany({ where: { accion: "asistente_paso", entidadId: { in: ids } }, select: { entidadId: true } }) : [],
    db.conversation.count({ where: { estado: { not: "cerrada" }, atendidaPor: "nadie", esperandoAsesorDesde: { not: null }, ...porCanalConv } }),
    db.message.findMany({ where: { direccion: "entrante", fecha: rango, conversacion: porCanalConv }, select: { fecha: true } }),
    db.aiRun.findMany({ where: { creado: rango, ...(canal || sinSimulado ? { conversacion: porCanalConv } : {}) }, select: { creado: true, costoUsd: true, productos: true, tipo: true } }),
    db.message.findMany({ where: { productoId: { not: null }, fecha: rango, conversacion: porCanalConv }, select: { productoId: true } }),
  ]);

  /* ── Indicadores ── */
  const porConv = new Map<string, typeof mensajes>();
  for (const m of mensajes) (porConv.get(m.conversacionId) ?? porConv.set(m.conversacionId, []).get(m.conversacionId)!).push(m);
  const primeras = { asistente: [] as number[], asesor: [] as number[] };
  let conAsistente = 0;
  let resueltas = 0;
  const derivadas = new Set(pasos.map((p) => p.entidadId));
  for (const c of nuevas) {
    const ms = porConv.get(c.id) ?? [];
    const t0 = ms.find((m) => m.direccion === "entrante");
    const resp = t0 && ms.find((m) => m.direccion === "saliente" && m.fecha >= t0.fecha && m.autor !== "cliente");
    if (t0 && resp) primeras[resp.autor === "asistente" ? "asistente" : "asesor"].push((resp.fecha.getTime() - t0.fecha.getTime()) / 1000);
    if (ms.some((m) => m.autor === "asistente")) {
      conAsistente++;
      if (!derivadas.has(c.id) && !ms.some((m) => m.autor === "asesor")) resueltas++;
    }
  }

  /* ── Conversaciones por día y canal ── */
  const claves: string[] = [];
  for (let t = inicio.getTime(); t < fin.getTime(); t += DIA) claves.push(claveDia(new Date(t + 6 * HORA + 1)));
  const diasLista = [...new Set(claves)];
  const conteo = new Map<string, Record<string, number>>(diasLista.map((d) => [d, {}]));
  for (const c of nuevas) {
    const fila = conteo.get(claveDia(c.creada));
    if (fila) fila[c.canal] = (fila[c.canal] ?? 0) + 1;
  }
  const presentes = canalesDeReporte().filter((k) => nuevas.some((c) => c.canal === k));

  /* ── Motivos ── */
  const motivos = new Map<string, number>();
  for (const c of nuevas) motivos.set(c.motivo ?? "sin", (motivos.get(c.motivo ?? "sin") ?? 0) + 1);

  /* ── Productos más consultados (consultas del asistente + tarjetas enviadas) ── */
  const consultas = new Map<string, number>();
  for (const r of corridas) if (r.tipo === "respuesta") for (const p of r.productos) consultas.set(p, (consultas.get(p) ?? 0) + 1);
  for (const m of enviados) if (m.productoId) consultas.set(m.productoId, (consultas.get(m.productoId) ?? 0) + 1);
  const top = [...consultas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const info = await db.product.findMany({ where: { id: { in: top.map(([id]) => id) } }, include: { stock: true } });

  /* ── Mensajes por hora ── */
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const m of entrantes) porHora[horaLocal(m.fecha)]! += 1;

  /* ── Costo del asistente ── */
  const costo = new Map<string, number>();
  for (const r of corridas) costo.set(claveDia(r.creado), (costo.get(claveDia(r.creado)) ?? 0) + r.costoUsd);

  // Acumulado del mes en que termina el rango, contra el presupuesto mensual.
  // Si ese mes apenas empezó (menos de 5 días), se muestra el mes anterior completo para que la gráfica diga algo.
  const [anio, nMes, diaHasta] = f.hasta.split("-").map(Number) as [number, number, number];
  const mesActual = f.hasta.slice(0, 7);
  const mes = diaHasta < 5 ? new Date(Date.UTC(anio, nMes - 2, 1)).toISOString().slice(0, 7) : mesActual;
  const inicioMes = inicioDe(`${mes}-01`);
  const finMes = new Date(diaHasta < 5 ? inicioDe(`${mesActual}-01`).getTime() : Math.min(fin.getTime(), Date.now() + DIA));
  const delMes = await db.aiRun.findMany({ where: { creado: { gte: inicioMes, lt: finMes }, ...(canal || sinSimulado ? { conversacion: porCanalConv } : {}) }, select: { creado: true, costoUsd: true } });
  const porDiaMes = new Map<string, number>();
  for (const r of delMes) porDiaMes.set(claveDia(r.creado), (porDiaMes.get(claveDia(r.creado)) ?? 0) + r.costoUsd);
  let acumulado = 0;
  const diasMes: Reportes["costoMes"]["dias"] = [];
  for (let t = inicioMes.getTime(); t < finMes.getTime(); t += DIA) {
    const clave = claveDia(new Date(t + 6 * HORA + 1));
    acumulado += porDiaMes.get(clave) ?? 0;
    diasMes.push({ fecha: clave, etiqueta: etiquetaDia(clave), acumulado });
  }
  const { presupuesto } = await estadoPresupuesto();

  const ventas = await generarVentas(f, diasLista, nuevas.map((c) => c.id));

  return {
    ventas,
    rango: { desde: f.desde, hasta: f.hasta, dias: diasLista.length },
    indicadores: {
      nuevas: nuevas.length,
      medianaAsistenteSeg: mediana(primeras.asistente),
      medianaAsesorSeg: mediana(primeras.asesor),
      resueltasPct: conAsistente ? Math.round((resueltas / conAsistente) * 100) : null,
      atendidasPorAsistente: conAsistente,
      esperandoAhora,
    },
    canales: presentes,
    porDia: diasLista.map((d) => ({ fecha: d, etiqueta: etiquetaDia(d), porCanal: conteo.get(d)! })),
    motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([m, total]) => ({ motivo: m, etiqueta: m === "sin" ? "Sin etiquetar" : ETIQUETA_MOTIVO[m as MotivoIa], total })),
    productos: top.map(([id, n]) => {
      const p = info.find((x) => x.id === id);
      return { id, nombre: p?.nombre ?? "Producto eliminado", consultas: n, existencia: p?.stock.reduce((s, x) => s + x.cantidad, 0) ?? 0 };
    }),
    porHora,
    costoPorDia: diasLista.map((d) => ({ fecha: d, etiqueta: etiquetaDia(d), costo: costo.get(d) ?? 0 })),
    costoMes: { mes, dias: diasMes, gasto: acumulado, presupuesto },
  };
}

/** Estados en los que el pedido ya no es una venta: se canceló o venció (aunque antes se haya pagado). */
const NO_SON_VENTA: EstadoPedido[] = ["borrador", "cancelado", "vencido"];

async function generarVentas(f: FiltrosReporte, diasLista: string[], conversacionesNuevas: string[]): Promise<Ventas> {
  const inicio = inicioDe(f.desde);
  const fin = new Date(inicioDe(f.hasta).getTime() + DIA);
  const rango = { gte: inicio, lt: fin };
  const canal = f.canal === "todos" ? undefined : f.canal;
  const delCanal: Prisma.OrderWhereInput = canal ? { canal } : canalesDeReporte().length < CANALES.length ? { canal: { not: "simulado" } } : {};

  const [creados, pagados, porVerificar, verificados, conPedido] = await Promise.all([
    db.order.findMany({ where: { creada: rango, estado: { not: "borrador" }, ...delCanal }, select: { estado: true } }),
    // Cada pedido pasa a «pagado» una sola vez: ese evento marca el día de la venta.
    db.orderEvent.findMany({
      where: { aEstado: "pagado", fecha: rango, pedido: { estado: { notIn: NO_SON_VENTA }, ...delCanal } },
      select: { fecha: true, pedido: { select: { total: true, canal: true, lineas: { select: { productoId: true, sku: true, nombre: true, cantidad: true, precio: true } } } } },
    }),
    db.payment.count({ where: { estado: "en_revision", pedido: { estado: { in: ["en_revision", "pendiente_pago"] }, ...delCanal } } }),
    db.payment.findMany({ where: { estado: "verificado", verificadoEn: rango, pedido: delCanal }, select: { creado: true, verificadoEn: true } }),
    conversacionesNuevas.length ? db.order.findMany({ where: { conversacionId: { in: conversacionesNuevas }, estado: { not: "borrador" } }, select: { conversacionId: true } }) : [],
  ]);

  const conteo = new Map<string, Record<string, number>>(diasLista.map((d) => [d, {}]));
  const porProducto = new Map<string, { nombre: string; unidades: number; monto: number }>();
  let ventas = 0;
  for (const e of pagados) {
    ventas += e.pedido.total;
    const fila = conteo.get(claveDia(e.fecha));
    if (fila) fila[e.pedido.canal] = (fila[e.pedido.canal] ?? 0) + e.pedido.total;
    for (const l of e.pedido.lineas) {
      const k = l.productoId ?? l.sku;
      const p = porProducto.get(k) ?? porProducto.set(k, { nombre: l.nombre, unidades: 0, monto: 0 }).get(k)!;
      p.unidades += l.cantidad;
      p.monto += l.cantidad * l.precio;
    }
  }
  const porEstado = new Map<EstadoPedido, number>();
  for (const o of creados) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const conversiones = new Set(conPedido.map((o) => o.conversacionId)).size;

  return {
    indicadores: {
      pedidos: creados.length,
      ventas,
      ticketPromedio: pagados.length ? Math.round(ventas / pagados.length) : null,
      conversionPct: conversacionesNuevas.length ? Math.round((conversiones / conversacionesNuevas.length) * 100) : null,
      porVerificar,
      vencidos: porEstado.get("vencido") ?? 0,
      medianaVerificacionSeg: mediana(verificados.filter((p) => p.verificadoEn).map((p) => (p.verificadoEn!.getTime() - p.creado.getTime()) / 1000)),
    },
    canales: canalesDeReporte().filter((k) => pagados.some((e) => e.pedido.canal === k)),
    porDia: diasLista.map((d) => ({ fecha: d, etiqueta: etiquetaDia(d), porCanal: conteo.get(d)! })),
    porEstado: [...porEstado.entries()].sort((a, b) => b[1] - a[1]).map(([estado, total]) => ({ estado, etiqueta: ETIQUETA_ESTADO[estado], total })),
    productos: [...porProducto.values()].sort((a, b) => b.unidades - a.unidades || b.monto - a.monto).slice(0, 10),
  };
}
