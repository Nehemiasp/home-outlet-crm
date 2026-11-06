import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { canalesDeReporte } from "@/lib/canales/tipos";
import { generarReportes, validarFiltros } from "@/lib/reportes";
import { estadoDePago } from "@/lib/pedidos/totales";
import type { Canal, EstadoPedido } from "@/generated/prisma/client";

// Necesita la base de datos (npm run db). Usa un rango de enero de 2025, sin datos de demostración, y borra lo que crea (prefijo PRUEBA-RV).

describe("estado del pago que se ve en las listas", () => {
  const p = (monto: number, estado: "en_revision" | "verificado" | "rechazado") => ({ monto, estado });
  test("sin pago, en revisión, parcial, pagado y rechazado", () => {
    assert.equal(estadoDePago(1000, []), "sin_pago");
    assert.equal(estadoDePago(1000, [p(1000, "en_revision")]), "en_revision");
    assert.equal(estadoDePago(1000, [p(600, "verificado")]), "parcial");
    assert.equal(estadoDePago(1000, [p(600, "verificado"), p(400, "en_revision")]), "en_revision");
    assert.equal(estadoDePago(1000, [p(600, "verificado"), p(400, "verificado")]), "pagado");
    assert.equal(estadoDePago(1000, [p(1500, "verificado")]), "pagado");
    assert.equal(estadoDePago(1000, [p(1000, "rechazado")]), "rechazado");
  });
});

describe("canal simulado en los reportes", () => {
  test("en producción no es un canal elegible ni un filtro válido; en desarrollo sí", () => {
    assert.ok(!canalesDeReporte(true).includes("simulado"));
    assert.ok(canalesDeReporte(false).includes("simulado"));
    assert.ok(canalesDeReporte(true).includes("whatsapp"));
  });
  test("el filtro «simulado» se rechaza en producción", () => {
    const antes = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    try {
      env.NODE_ENV = "production";
      assert.equal(validarFiltros({ desde: "2025-01-10", hasta: "2025-01-12", canal: "simulado" }), "El canal no es válido.");
      env.NODE_ENV = "test";
      assert.equal(validarFiltros({ desde: "2025-01-10", hasta: "2025-01-12", canal: "simulado" }), null);
    } finally {
      env.NODE_ENV = antes;
    }
  });
});

describe("reportes de ventas (con base de datos)", () => {
  const desde = "2025-01-10";
  const hasta = "2025-01-12";
  const filtro = { desde, hasta, canal: "todos" as const };
  let contactoId: string;
  let productoA: { id: string; sku: string; nombre: string };
  let productoB: { id: string; sku: string; nombre: string };
  let n = 0;
  // Mediodía de Guatemala = 18:00 UTC.
  const en = (dia: number, hora = 18) => new Date(Date.UTC(2025, 0, dia, hora));

  const pedido = async (o: { canal: Canal; estado: EstadoPedido; total: number; pagadoEl?: Date; creada?: Date; conversacionId?: string; lineas?: [typeof productoA, number][] }) => {
    const lineas = o.lineas ?? [[productoA, 1]];
    return db.order.create({
      data: {
        codigo: `PRUEBA-RV-${++n}`, contactoId, conversacionId: o.conversacionId, canal: o.canal, estado: o.estado, subtotal: o.total, total: o.total, creada: o.creada ?? o.pagadoEl ?? en(10),
        lineas: { create: lineas.map(([p, cantidad]) => ({ productoId: p.id, sku: p.sku, nombre: p.nombre, precio: Math.round(o.total / lineas.reduce((t, [, c]) => t + c, 0)), cantidad })) },
        eventos: o.pagadoEl ? { create: [{ aEstado: "pagado", fecha: o.pagadoEl }] } : undefined,
      },
    });
  };

  before(async () => {
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-RV contacto" } })).id;
    const crear = (sku: string) => db.product.create({ data: { sku: `PRUEBA-RV-${sku}`, nombre: `PRUEBA-RV producto ${sku}`, precio: 1000 } });
    productoA = await crear("A");
    productoB = await crear("B");
  });
  after(async () => {
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-RV-" } } });
    await db.$disconnect();
  });

  test("ventas por día y canal, ticket promedio, pedidos por estado y productos más vendidos", async () => {
    // Dos ventas el día 10 y 11, otra el 12; un pedido cancelado que se había pagado (no es venta) y un vencido.
    await pedido({ canal: "whatsapp", estado: "entregado", total: 99_000, pagadoEl: en(10), lineas: [[productoA, 2], [productoB, 1]] });
    await pedido({ canal: "instagram", estado: "pagado", total: 51_000, pagadoEl: en(11), lineas: [[productoA, 3]] });
    await pedido({ canal: "whatsapp", estado: "preparando", total: 30_000, pagadoEl: en(12), lineas: [[productoB, 1]] });
    await pedido({ canal: "whatsapp", estado: "cancelado", total: 999_000, pagadoEl: en(11) });
    await pedido({ canal: "tiktok", estado: "vencido", total: 20_000, creada: en(11) });
    await pedido({ canal: "tiktok", estado: "borrador", total: 5_000, creada: en(11) }); // un borrador no cuenta

    const v = (await generarReportes(filtro)).ventas;
    const i = v.indicadores;
    assert.deepEqual([i.pedidos, i.ventas, i.ticketPromedio, i.vencidos], [5, 180_000, 60_000, 1]); // pedidos creados: sin el borrador
    assert.deepEqual(v.canales, ["whatsapp", "instagram"]);
    assert.deepEqual(v.porDia.map((d) => [d.fecha, d.porCanal.whatsapp ?? 0, d.porCanal.instagram ?? 0]), [["2025-01-10", 99_000, 0], ["2025-01-11", 0, 51_000], ["2025-01-12", 30_000, 0]]);
    assert.deepEqual(Object.fromEntries(v.porEstado.map((e) => [e.estado, e.total])), { entregado: 1, pagado: 1, preparando: 1, cancelado: 1, vencido: 1 });
    // A: 2 + 3 unidades; B: 1 + 1. Los pedidos cancelados no suman.
    assert.deepEqual(v.productos.map((p) => [p.nombre, p.unidades]), [["PRUEBA-RV producto A", 5], ["PRUEBA-RV producto B", 2]]);
    assert.deepEqual(v.productos.map((p) => p.monto), [2 * 33_000 + 51_000, 33_000 + 30_000]); // cada unidad al precio al que se vendió
  });

  test("el filtro por canal solo cuenta ese canal", async () => {
    const v = (await generarReportes({ ...filtro, canal: "instagram" })).ventas;
    assert.deepEqual([v.indicadores.pedidos, v.indicadores.ventas, v.canales], [1, 51_000, ["instagram"]]);
    const sin = (await generarReportes({ ...filtro, canal: "facebook" })).ventas;
    assert.deepEqual([sin.indicadores.pedidos, sin.indicadores.ventas, sin.indicadores.ticketPromedio, sin.productos.length], [0, 0, null, 0]);
  });

  test("conversaciones con pedido, pagos por verificar y mediana de verificación", async () => {
    const antes = (await generarReportes({ ...filtro, canal: "simulado" })).ventas.indicadores.porVerificar; // otros pagos en revisión que ya existan
    const conv = (hora: number) => db.conversation.create({ data: { contactoId, canal: "simulado", creada: en(10, hora) } });
    const [c1, c2, c3, c4] = [await conv(15), await conv(16), await conv(17), await conv(18)];
    const o1 = await pedido({ canal: "simulado", estado: "en_revision", total: 10_000, creada: en(10), conversacionId: c1.id });
    await pedido({ canal: "simulado", estado: "pendiente_pago", total: 10_000, creada: en(10), conversacionId: c2.id });
    await pedido({ canal: "simulado", estado: "pendiente_pago", total: 10_000, creada: en(10), conversacionId: c2.id }); // dos pedidos de la misma conversación cuentan una vez
    void c3;
    void c4;
    const pago = (estado: "en_revision" | "verificado", minutos?: number) =>
      db.payment.create({ data: { pedidoId: o1.id, tipo: "transferencia", banco: "B", referencia: `R-${++n}`, monto: 1000, fechaPago: en(10), estado, creado: en(10, 15), verificadoEn: minutos ? new Date(en(10, 15).getTime() + minutos * 60_000) : null } });
    await pago("en_revision");
    for (const m of [10, 20, 90]) await pago("verificado", m);

    const v = (await generarReportes({ ...filtro, canal: "simulado" })).ventas.indicadores;
    assert.equal(v.porVerificar, antes + 1);
    assert.equal(v.medianaVerificacionSeg, 20 * 60);
    assert.equal(v.conversionPct, 50); // 2 de las 4 conversaciones nuevas del canal tienen pedido
  });

  test("un rango sin datos devuelve ceros, no errores", async () => {
    const v = (await generarReportes({ desde: "2019-01-01", hasta: "2019-01-03", canal: "todos" })).ventas;
    assert.deepEqual([v.indicadores.pedidos, v.indicadores.ventas, v.indicadores.ticketPromedio, v.indicadores.medianaVerificacionSeg, v.porEstado.length], [0, 0, null, null, 0]);
    assert.equal(v.porDia.length, 3);
  });
});
