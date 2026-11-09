import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { costoSegunPago } from "@/lib/pedidos/envio";
import { siguientes } from "@/lib/pedidos/estados";
import { avanzarPedido, marcarEnviado } from "@/lib/pedidos/gestion";
import { compatibleConEntrega } from "@/lib/pedidos/metodos";
import { cambiarFormaDePago, construirResumen, enviarAlCliente, errorDeForma, guardarBorrador, type ActorPedidos } from "@/lib/pedidos/pedidos";
import type { EntradaPedido } from "@/lib/pedidos/tipos";
import { vencerReservas } from "@/lib/pedidos/vencimiento";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-CE y se borra al final.

describe("pago contra entrega: reglas", () => {
  const regla = { envioGratisDesde: null, costoContraEntrega: 3500, envioGratisSinContraEntrega: true };
  const zona = { costo: 2500 };

  test("contra entrega cuesta el envío fijo; las demás formas, envío gratis (o el de la zona si se apaga)", () => {
    assert.equal(costoSegunPago(regla, zona, 10_000, "contra_entrega"), 3500);
    for (const m of ["transferencia", "deposito", "tarjeta", null]) assert.equal(costoSegunPago(regla, zona, 10_000, m), 0);
    assert.equal(costoSegunPago({ ...regla, envioGratisSinContraEntrega: false }, zona, 10_000, "transferencia"), 2500);
    assert.equal(costoSegunPago({ ...regla, envioGratisSinContraEntrega: false, envioGratisDesde: 5_000 }, zona, 10_000, "deposito"), 0);
    assert.equal(costoSegunPago({ ...regla, envioGratisDesde: 5_000 }, zona, 10_000, "contra_entrega"), 3500); // el fijo no depende del monto
    // Gratis desde Q200 con las demás formas; por debajo, el mismo costo fijo.
    const desde200 = { ...regla, envioGratisDesde: 20_000 };
    for (const m of ["transferencia", "deposito", "tarjeta", null]) {
      assert.equal(costoSegunPago(desde200, zona, 19_999, m), 3500);
      assert.equal(costoSegunPago(desde200, zona, 20_000, m), 0);
    }
    assert.equal(costoSegunPago(desde200, zona, 50_000, "contra_entrega"), 3500);
  });

  test("solo con envío, y se puede preparar sin pago previo", () => {
    assert.equal(compatibleConEntrega("contra_entrega", "envio"), true);
    assert.equal(compatibleConEntrega("contra_entrega", "recoger"), false);
    assert.match(errorDeForma("contra_entrega", "recoger", ["contra_entrega"]) ?? "", /solo sirve cuando el pedido se envía/);
    assert.deepEqual(siguientes("pendiente_pago", "envio", "contra_entrega")[0], "preparando");
    assert.equal(siguientes("pendiente_pago", "envio", "transferencia").includes("preparando"), false);
  });
});

describe("pago contra entrega (con base de datos)", () => {
  let agente: ActorPedidos;
  let convId: string;
  let contactoId: string;
  let ubicacion: string;
  let producto: { id: string };
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  const ajustes = (d: object) => db.ajustesPedidos.update({ where: { id: "pedidos" }, data: d });
  const stock = async () => db.stock.findFirstOrThrow({ where: { productoId: producto.id } });
  const base = (sobre: Partial<EntradaPedido> = {}): EntradaPedido => ({
    pedidoId: null, conversacionId: convId,
    cliente: { nombre: "PRUEBA-CE cliente", telefono: "", departamento: "Izabal", municipio: "Morales" },
    lineas: [{ productoId: producto.id, cantidad: 2, ubicacionId: null }],
    entrega: "envio", direccion: "Barrio El Centro", referencia: "", descuento: null, descuentoMotivo: "", notas: "", metodoPago: "contra_entrega", ...sobre,
  });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    const u = await db.user.create({ data: { nombre: "Agente PRUEBA-CE", correo: "prueba-ce-agente@homeoutlet.test", passwordHash: "x", rol: "agente" } });
    agente = { id: u.id, nombre: u.nombre, rol: "agente" };
    ubicacion = (await db.location.create({ data: { nombre: "PRUEBA-CE Bodega" } })).id;
    await ajustes({ inventario: "separado", ubicacionRecogerId: ubicacion, ubicacionEnvioId: ubicacion, horasReserva: 24, prefijo: "PRCE-", metodos: ["transferencia", "deposito", "contra_entrega"], costoContraEntrega: 3500, envioGratisSinContraEntrega: true, envioGratisDesde: null });
    producto = await db.product.create({ data: { sku: "PRUEBA-CE-1", nombre: "PRUEBA-CE licuadora", precio: 10_000 } });
    await db.stock.create({ data: { productoId: producto.id, ubicacionId: ubicacion, cantidad: 10 } });
    await db.shippingZone.create({ data: { nombre: "PRUEBA-CE Zona", departamentos: ["Izabal"], municipios: ["Morales"], costo: 2_500, tiempo: "1 día" } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-CE cliente" } })).id;
    process.env.CHANNELS_ENABLED = "simulado";
    convId = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date() } })).id;
  });

  after(async () => {
    await ajustes({ inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, horasReserva: originales.horasReserva, prefijo: originales.prefijo, siguienteNumero: originales.siguienteNumero, metodos: originales.metodos, costoContraEntrega: originales.costoContraEntrega, envioGratisSinContraEntrega: originales.envioGratisSinContraEntrega, envioGratisDesde: originales.envioGratisDesde });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-CE-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-CE" } } });
    await db.shippingZone.deleteMany({ where: { nombre: { startsWith: "PRUEBA-CE" } } });
    await db.activityLog.deleteMany({ where: { usuarioId: agente.id } });
    await db.user.deleteMany({ where: { id: agente.id } });
    await db.$disconnect();
  });

  test("el envío cuesta Q35 con contra entrega y es gratis con transferencia, aunque la zona cueste otra cosa", async () => {
    const ce = await guardarBorrador(base(), agente);
    const tr = await guardarBorrador(base({ metodoPago: "transferencia" }), agente);
    assert.ok(ce.ok && tr.ok);
    const [a, b] = await Promise.all([db.order.findUniqueOrThrow({ where: { id: ce.pedidoId } }), db.order.findUniqueOrThrow({ where: { id: tr.pedidoId } })]);
    assert.deepEqual([a.costoEnvio, a.total], [3_500, 23_500]);
    assert.deepEqual([b.costoEnvio, b.total], [0, 20_000]);
    assert.equal((await guardarBorrador(base({ entrega: "recoger" }), agente)).ok, false); // contra entrega solo con envío
  });

  test("se envía sin vencer, se prepara sin pago (ahí sale la existencia) y al entregarlo queda cobrado", async () => {
    const g = await guardarBorrador(base(), agente);
    assert.ok(g.ok);
    const e = await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false });
    assert.ok(e.ok, e.ok ? "" : e.error);
    assert.match(e.texto, /Pagará Q235\.00 al recibir su pedido/);
    assert.doesNotMatch(e.texto, /Apartamos sus productos por/); // no vence
    let o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } });
    assert.deepEqual([o.estado, o.reservadoHasta], ["pendiente_pago", null]);
    assert.equal((await stock()).apartado, 2);
    await vencerReservas({ forzar: true });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).estado, "pendiente_pago");

    assert.ok((await avanzarPedido(g.pedidoId, "preparando", agente)).ok); // sin pago previo
    const s = await stock();
    assert.deepEqual([s.cantidad, s.apartado], [8, 0]);
    assert.ok((await marcarEnviado(g.pedidoId, agente, { paqueteria: null, guia: "", archivo: null })).ok);
    assert.ok((await avanzarPedido(g.pedidoId, "entregado", agente)).ok);
    const entregado = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId }, include: { pagos: true } });
    assert.equal(entregado.estado, "entregado");
    assert.deepEqual(entregado.pagos.map((p) => [p.tipo, p.monto, p.estado, p.verificadoPorId]), [["contra_entrega", 23_500, "verificado", agente.id]]);
  });

  test("con transferencia no se puede preparar sin pago", async () => {
    const g = await guardarBorrador(base({ metodoPago: "transferencia" }), agente);
    assert.ok(g.ok);
    assert.ok((await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false })).ok);
    assert.equal((await avanzarPedido(g.pedidoId, "preparando", agente)).ok, false);
    assert.ok((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).reservadoHasta); // este sí vence
  });

  test("cambiar de transferencia a contra entrega vuelve a calcular el envío y deja de vencer; al revés, lo quita y vence", async () => {
    const g = await guardarBorrador(base({ metodoPago: "transferencia" }), agente);
    assert.ok(g.ok);
    assert.ok((await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false })).ok);
    assert.ok((await cambiarFormaDePago(g.pedidoId, "contra_entrega", agente)).ok);
    let o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } });
    assert.deepEqual([o.metodoPago, o.costoEnvio, o.total, o.reservadoHasta], ["contra_entrega", 3_500, 23_500, null]);
    assert.match(await construirResumen(g.pedidoId), /Pagará Q235\.00 al recibir/);
    assert.ok((await cambiarFormaDePago(g.pedidoId, "deposito", agente)).ok);
    o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } });
    assert.deepEqual([o.costoEnvio, o.total], [0, 20_000]);
    assert.ok(o.reservadoHasta);
  });
});
