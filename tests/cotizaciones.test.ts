import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { cargarParaConvertir, enviarCotizacion, listarCotizaciones } from "@/lib/pedidos/cotizaciones";
import { datosPanel, descartarBorrador, enviarAlCliente, guardarBorrador, type ActorPedidos } from "@/lib/pedidos/pedidos";
import type { EntradaPedido } from "@/lib/pedidos/tipos";
import { estadoDeCotizacion, finDeVigencia, textoFecha } from "@/lib/pedidos/vigencia";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-COT y se borra al final.

describe("vigencia de la cotización", () => {
  test("vale hasta el final del día, en hora de Guatemala, que cae N días después", () => {
    const lunes = new Date("2026-11-09T10:00:00-06:00");
    assert.equal(finDeVigencia(lunes, 3).toISOString(), new Date("2026-11-12T23:59:59.999-06:00").toISOString());
    // El lunes a las 23:00 de Guatemala ya es martes en UTC: igual cuenta desde el lunes.
    assert.equal(finDeVigencia(new Date("2026-11-09T23:00:00-06:00"), 1).toISOString(), new Date("2026-11-10T23:59:59.999-06:00").toISOString());
    assert.equal(textoFecha(new Date("2026-11-12T23:59:59.999-06:00")), "jueves 12 de noviembre");
  });

  test("enviada y con fecha por delante = vigente; pasada la fecha = vencida; convertida = aceptada", () => {
    const hasta = new Date("2026-11-12T23:59:59.999-06:00");
    assert.equal(estadoDeCotizacion({ estado: "enviada", validaHasta: hasta }, new Date("2026-11-12T23:00:00-06:00")), "vigente");
    assert.equal(estadoDeCotizacion({ estado: "enviada", validaHasta: hasta }, new Date("2026-11-13T00:00:00-06:00")), "vencida");
    assert.equal(estadoDeCotizacion({ estado: "aceptada", validaHasta: hasta }, new Date("2026-12-01T00:00:00-06:00")), "aceptada");
  });
});

describe("cotizaciones (con base de datos)", () => {
  let agente: ActorPedidos;
  let convId: string;
  let contactoId: string;
  let ubicacion: string;
  let producto: { id: string };
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  const ajustes = (d: object) => db.ajustesPedidos.update({ where: { id: "pedidos" }, data: d });
  const precio = (centavos: number) => db.product.update({ where: { id: producto.id }, data: { precio: centavos } });

  const base = (sobre: Partial<EntradaPedido> = {}): EntradaPedido => ({
    pedidoId: null, conversacionId: convId,
    cliente: { nombre: "PRUEBA-COT cliente", telefono: "", departamento: "", municipio: "" },
    lineas: [{ productoId: producto.id, cantidad: 2, ubicacionId: null }],
    entrega: "recoger", direccion: "", referencia: "", descuento: null, descuentoMotivo: "", notas: "", metodoPago: null, ...sobre,
  });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    const u = await db.user.create({ data: { nombre: "Agente PRUEBA-COT", correo: "prueba-cot-agente@homeoutlet.test", passwordHash: "x", rol: "agente" } });
    agente = { id: u.id, nombre: u.nombre, rol: "agente" };
    ubicacion = (await db.location.create({ data: { nombre: "PRUEBA-COT Tienda" } })).id;
    await ajustes({ inventario: "separado", ubicacionRecogerId: ubicacion, ubicacionEnvioId: ubicacion, descuentoMaxAgente: 0, horasReserva: 24, prefijo: "PRCOT-", diasCotizacion: 3 });
    producto = await db.product.create({ data: { sku: "PRUEBA-COT-1", nombre: "PRUEBA-COT sofá", precio: 10_000 } });
    await db.stock.create({ data: { productoId: producto.id, ubicacionId: ubicacion, cantidad: 1 } }); // menos de lo que se cotiza: igual se puede cotizar
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-COT cliente" } })).id;
    process.env.CHANNELS_ENABLED = "simulado";
    convId = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date(), asignadaAId: agente.id } })).id; // el asesor solo ve las suyas
    await db.bankAccount.create({ data: { banco: "PRUEBA-COT Banco", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet" } });
  });

  after(async () => {
    await ajustes({ inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, descuentoMaxAgente: originales.descuentoMaxAgente, horasReserva: originales.horasReserva, prefijo: originales.prefijo, siguienteNumero: originales.siguienteNumero, diasCotizacion: originales.diasCotizacion, siguienteCotizacion: originales.siguienteCotizacion });
    await db.order.deleteMany({ where: { contactoId } });
    await db.cotizacion.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-COT-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-COT" } } });
    await db.bankAccount.deleteMany({ where: { banco: { startsWith: "PRUEBA-COT" } } });
    await db.activityLog.deleteMany({ where: { usuarioId: agente.id } });
    await db.user.deleteMany({ where: { id: agente.id } });
    await db.$disconnect();
  });

  test("se cotiza sin forma de pago ni existencia suficiente, no aparta nada y lleva su propio consecutivo", async () => {
    const antes = new Date();
    const r = await enviarCotizacion(base(), agente, "copiado");
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.match(r.codigo, /^COT-\d{6}$/);
    const c = await db.cotizacion.findUniqueOrThrow({ where: { id: r.cotizacionId }, include: { lineas: true } });
    assert.deepEqual([c.total, c.estado, c.lineas.length, c.lineas[0]!.cantidad, c.lineas[0]!.precio], [20_000, "enviada", 1, 2, 10_000]);
    assert.equal(c.validaHasta.toISOString(), finDeVigencia(antes, 3).toISOString());
    assert.equal((await db.stock.findFirstOrThrow({ where: { productoId: producto.id } })).apartado, 0);
    assert.equal(await db.order.count({ where: { contactoId } }), 0); // no gasta un número de pedido
    assert.ok(r.texto.startsWith(`Cotización ${r.codigo}\n\n2 × PRUEBA-COT sofá   Q200.00`), r.texto);
    assert.match(r.texto, new RegExp(`valen hasta el ${textoFecha(c.validaHasta)}`));
    assert.doesNotMatch(r.texto, /PRUEBA-COT Banco/); // sin cuentas: todavía no se cobra
    await descartar(r.cotizacionId);
  });

  test("al convertirla, el pedido respeta el precio cotizado aunque el catálogo suba, y la cotización queda aceptada", async () => {
    const r = await enviarCotizacion(base(), agente, "copiado");
    assert.ok(r.ok);
    await precio(12_000);
    const panel = await datosPanel(convId, agente);
    assert.ok(panel.ok && panel.datos.cotizaciones.some((c) => c.id === r.cotizacionId && c.estado === "vigente"));

    const carga = await cargarParaConvertir(r.cotizacionId, convId);
    assert.ok(carga.ok, carga.ok ? "" : carga.error);
    assert.equal(carga.entrada.cotizacionId, r.cotizacionId);
    const g = await guardarBorrador({ ...carga.entrada, metodoPago: "transferencia" }, agente);
    assert.ok(g.ok, g.ok ? "" : g.error);
    const o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId }, include: { lineas: true } });
    assert.deepEqual([o.cotizacionId, o.lineas[0]!.precio, o.total], [r.cotizacionId, 10_000, 20_000]);

    // Mientras ese borrador sigue, la cotización no da para otro pedido.
    const otra = await guardarBorrador({ ...carga.entrada, metodoPago: "transferencia" }, agente);
    assert.ok(!otra.ok && /ya tiene el pedido/.test(otra.error));

    await db.stock.updateMany({ where: { productoId: producto.id }, data: { cantidad: 10 } });
    const e = await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false });
    assert.ok(e.ok, e.ok ? "" : e.error);
    assert.equal((await db.cotizacion.findUniqueOrThrow({ where: { id: r.cotizacionId } })).estado, "aceptada");
    const otraVez = await cargarParaConvertir(r.cotizacionId, convId);
    assert.ok(!otraVez.ok && /ya se convirtió/.test(otraVez.error));
    const lista = await listarCotizaciones({ q: r.codigo, limite: 10 }, agente);
    assert.deepEqual(lista.items.map((c) => [c.estado, c.pedido?.id]), [["aceptada", g.pedidoId]]);
    await precio(10_000);
  });

  test("si el catálogo baja, el pedido lleva el precio más bajo; si se descarta el borrador, la cotización vuelve a quedar libre", async () => {
    const r = await enviarCotizacion(base(), agente, "copiado");
    assert.ok(r.ok);
    await precio(8_000);
    const carga = await cargarParaConvertir(r.cotizacionId, convId);
    assert.ok(carga.ok);
    const g = await guardarBorrador({ ...carga.entrada, metodoPago: "transferencia" }, agente);
    assert.ok(g.ok);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).total, 16_000);
    await descartarBorrador(g.pedidoId, agente);
    assert.ok((await cargarParaConvertir(r.cotizacionId, convId)).ok);
    await precio(10_000);
    await descartar(r.cotizacionId);
  });

  test("vencida se puede convertir, pero con los precios de hoy y avisándolo", async () => {
    const r = await enviarCotizacion(base(), agente, "copiado");
    assert.ok(r.ok);
    await db.cotizacion.update({ where: { id: r.cotizacionId }, data: { validaHasta: new Date(Date.now() - 60_000) } });
    await precio(12_000);
    const carga = await cargarParaConvertir(r.cotizacionId, convId);
    assert.ok(carga.ok && /venció/.test(carga.aviso ?? ""));
    const g = await guardarBorrador({ ...carga.entrada, metodoPago: "transferencia" }, agente);
    assert.ok(g.ok);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).total, 24_000);
    assert.equal((await listarCotizaciones({ q: r.codigo, limite: 10 }, agente)).items[0]!.estado, "vencida");
    await descartarBorrador(g.pedidoId, agente);
    await precio(10_000);
  });

  test("una cotización de otra conversación no se puede usar", async () => {
    const r = await enviarCotizacion(base(), agente, "copiado");
    assert.ok(r.ok);
    const otraConv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date() } })).id;
    assert.equal((await cargarParaConvertir(r.cotizacionId, otraConv)).ok, false);
    const g = await guardarBorrador(base({ conversacionId: otraConv, cotizacionId: r.cotizacionId, metodoPago: "transferencia" }), agente);
    assert.ok(!g.ok && /no existe en esta conversación/.test(g.error));
  });

  /** Una cotización que ya no se usa en la prueba siguiente: se marca aceptada para que no aparezca en el panel. */
  const descartar = (id: string) => db.cotizacion.update({ where: { id }, data: { estado: "aceptada" } });
});
