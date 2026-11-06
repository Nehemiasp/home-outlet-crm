import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { configMensajes, mezclarConfig, resumenPagos } from "@/lib/pedidos/avisos";
import { cambiarEstado } from "@/lib/pedidos/flujo";
import { buscarDuplicados, registrarPago, rechazarPago, verificarPago, type ActorPagos, type EntradaPago } from "@/lib/pedidos/pagos";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-PG y se borra al final.

describe("textos de los avisos", () => {
  test("usa los de fábrica y respeta lo que se edite o apague", () => {
    const base = mezclarConfig(null);
    assert.equal(base.pago_confirmado.activo, true);
    assert.equal(base.por_vencer.activo, false); // la reserva por vencer viene apagada
    const c = mezclarConfig({ pago_confirmado: { activo: false, texto: "Pagado {codigo}" }, vencido: { texto: "   " }, por_vencer: { activo: true }, otro: 5 });
    assert.deepEqual(c.pago_confirmado, { activo: false, texto: "Pagado {codigo}" });
    assert.equal(c.vencido.texto, base.vencido.texto); // un texto en blanco vuelve al de fábrica
    assert.equal(c.por_vencer.activo, true);
  });
});

describe("comprobantes y verificación (con base de datos)", () => {
  let admin: ActorPagos;
  let agente: ActorPagos;
  let verificador: ActorPagos;
  let contactoId: string;
  let conv: string;
  let ubicA: string;
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  let n = 0;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });

  const imagen = async () =>
    (await db.message.create({ data: { conversacionId: conv, direccion: "entrante", tipo: "image", archivoUrl: "/api/archivos/00000000-0000-0000-0000-000000000000.png" } })).id;
  /** Un pedido pendiente de pago de Q1,250.00 con 2 unidades apartadas. */
  const pedido = async () => {
    const p = await db.product.create({ data: { sku: `PRUEBA-PG-${++n}`, nombre: `PRUEBA-PG ${n}`, precio: 62_500 } });
    await db.stock.create({ data: { productoId: p.id, ubicacionId: ubicA, cantidad: 10 } });
    const o = await db.order.create({
      data: { codigo: `PRUEBA-PG-${Date.now()}-${n}`, contactoId, conversacionId: conv, canal: "simulado", subtotal: 125_000, total: 125_000, lineas: { create: { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: 62_500, cantidad: 2, ubicacionId: ubicA } } },
    });
    assert.equal((await cambiarEstado({ pedidoId: o.id, a: "pendiente_pago", quien: { usuarioId: admin.id } })).ok, true);
    return { ...o, productoId: p.id };
  };
  const stock = async (productoId: string) => db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId, ubicacionId: ubicA } } });
  const estado = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).estado;
  const entrada = (pedidoId: string, sobre: Partial<EntradaPago> = {}): EntradaPago => ({ pedidoId, tipo: "transferencia", banco: "Banco PRUEBA-PG", referencia: `REF-${++n}`, monto: "1,250.00", fecha: hoy, ...sobre });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    const u = (nombre: string, rol: "admin" | "agente", extra = {}) => db.user.create({ data: { nombre, correo: `prueba-pg-${nombre.toLowerCase().replace(/\W/g, "")}@homeoutlet.test`, passwordHash: "x", rol, ...extra } });
    const [a, g, v] = await Promise.all([u("Admin PG", "admin"), u("Agente PG", "agente"), u("Verificador PG", "agente", { puedeVerificarPagos: true })]);
    admin = { id: a.id, nombre: a.nombre, rol: "admin" };
    agente = { id: g.id, nombre: g.nombre, rol: "agente", puedeVerificarPagos: false };
    verificador = { id: v.id, nombre: v.nombre, rol: "agente", puedeVerificarPagos: true };
    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-PG A" } })).id;
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: "separado", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicA, metodos: ["transferencia", "deposito"], mensajes: Prisma.JsonNull } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-PG cliente" } })).id;
    await db.channelIdentity.create({ data: { contactoId, canal: "simulado", externalContactId: "prueba-pg-sim" } });
    conv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date(), atendidaPor: "asistente" } })).id;
  });
  after(async () => {
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, metodos: originales.metodos, mensajes: (originales.mensajes as Prisma.InputJsonValue | null) ?? Prisma.JsonNull } });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-PG-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-PG" } } });
    const ids = [admin.id, agente.id, verificador.id];
    await db.activityLog.deleteMany({ where: { usuarioId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  test("registrar un comprobante pasa el pedido a revisión y avisa al cliente sin quitarle la conversación al asistente", async () => {
    const o = await pedido();
    const m = await imagen();
    const r = await registrarPago(entrada(o.id, { mensajeId: m, referencia: "B-1001" }), agente);
    assert.ok(r.ok);
    assert.equal(await estado(o.id), "en_revision");
    const p = await db.payment.findUniqueOrThrow({ where: { id: r.pagoId } });
    assert.deepEqual([p.estado, p.monto, p.mensajeId, p.registradoPorId, p.tipo], ["en_revision", 125_000, m, agente.id, "transferencia"]);
    assert.equal(p.fechaPago.toISOString().slice(0, 10), hoy);

    assert.equal(r.aviso.estado, "enviado");
    const aviso = await db.message.findFirstOrThrow({ where: { pedidoId: o.id, direccion: "saliente" } });
    assert.match(aviso.texto!, new RegExp(`^Recibimos su comprobante del pedido ${o.codigo}`));
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conv } })).atendidaPor, "asistente");

    assert.equal((await registrarPago(entrada(o.id, { mensajeId: m }), agente)).ok, false); // la misma imagen no se registra dos veces
  });

  test("valida método, banco, referencia, monto, fecha, imagen y estado del pedido", async () => {
    const o = await pedido();
    const m = await imagen();
    const mal = async (sobre: Partial<EntradaPago>) => assert.equal((await registrarPago(entrada(o.id, sobre), agente)).ok, false, JSON.stringify(sobre));
    await mal({ tipo: "efectivo_en_tienda" }); // no está activo
    await mal({ tipo: "tarjeta" });
    await mal({ banco: " " });
    await mal({ referencia: "" });
    await mal({ monto: "0" });
    await mal({ monto: "mucho" });
    await mal({ fecha: "2999-01-01" });
    await mal({ fecha: "2020-01-01" });
    await mal({ fecha: "ayer" });
    await mal({ mensajeId: "no-existe" });
    const propia = await db.message.create({ data: { conversacionId: conv, direccion: "saliente", tipo: "image", archivoUrl: "/api/archivos/x.png" } });
    await mal({ mensajeId: propia.id }); // la imagen debe ser del cliente
    assert.equal(await estado(o.id), "pendiente_pago");

    const borrador = await db.order.create({ data: { codigo: `PRUEBA-PG-B-${Date.now()}`, contactoId, conversacionId: conv, canal: "simulado" } });
    assert.equal((await registrarPago(entrada(borrador.id, { mensajeId: m }), agente)).ok, false);
    assert.equal((await registrarPago(entrada("no-existe"), agente)).ok, false);
  });

  test("avisa de un posible duplicado (mismo banco y referencia) aunque cambien mayúsculas o espacios, sin bloquear", async () => {
    const [a, b] = [await pedido(), await pedido()];
    assert.ok((await registrarPago(entrada(a.id, { banco: "Banco Industrial PRUEBA-PG", referencia: "D-777" }), agente)).ok);
    const r = await registrarPago(entrada(b.id, { banco: "  banco industrial prueba-pg ", referencia: "d-777" }), agente);
    assert.ok(r.ok);
    assert.deepEqual(r.duplicados.map((d) => d.codigo), [a.codigo]);
    assert.equal((await buscarDuplicados("Banco Industrial PRUEBA-PG", "otra")).length, 0);
    assert.equal((await buscarDuplicados(null, "d-777")).length, 0);

    // Un pago rechazado ya no cuenta como duplicado.
    await rechazarPago((await db.payment.findFirstOrThrow({ where: { pedidoId: a.id } })).id, "No aparece", admin);
    assert.equal((await buscarDuplicados("Banco Industrial PRUEBA-PG", "D-777")).filter((d) => d.codigo === a.codigo).length, 0);
  });

  test("verificar: solo admin o quien tenga el permiso; un pago que cubre el total pasa el pedido a pagado y descuenta", async () => {
    const o = await pedido();
    const { pagoId } = (await registrarPago(entrada(o.id), agente)) as { pagoId: string };
    assert.equal((await verificarPago(pagoId, agente)).ok, false); // sin permiso
    assert.equal(await estado(o.id), "en_revision");

    const r = await verificarPago(pagoId, verificador);
    assert.ok(r.ok && r.cubierto && r.saldo === 0);
    assert.equal(await estado(o.id), "pagado");
    assert.deepEqual([(await stock(o.productoId)).cantidad, (await stock(o.productoId)).apartado], [8, 0]);
    const p = await db.payment.findUniqueOrThrow({ where: { id: pagoId } });
    assert.deepEqual([p.estado, p.verificadoPorId], ["verificado", verificador.id]);
    assert.ok(p.verificadoEn);
    const aviso = await db.message.findFirstOrThrow({ where: { pedidoId: o.id, texto: { startsWith: "Confirmamos su pago" } } });
    assert.match(aviso.texto!, new RegExp(o.codigo));

    assert.equal((await verificarPago(pagoId, admin)).ok, false); // ya se revisó
    assert.equal((await rechazarPago(pagoId, "tarde", admin)).ok, false);
  });

  test("pagos parciales: el pedido espera el resto con su saldo, y al completarlo se paga", async () => {
    const o = await pedido();
    const uno = (await registrarPago(entrada(o.id, { monto: "800.00" }), agente)) as { pagoId: string };
    const r1 = await verificarPago(uno.pagoId, admin);
    assert.ok(r1.ok && !r1.cubierto && r1.saldo === 45_000);
    assert.equal(await estado(o.id), "pendiente_pago");
    assert.equal((await stock(o.productoId)).apartado, 2); // sigue apartado
    assert.deepEqual(await resumenPagos(o.id), { total: 125_000, verificado: 80_000, enRevision: 0, saldo: 45_000 });
    assert.ok((await db.message.findFirstOrThrow({ where: { pedidoId: o.id, texto: { contains: "saldo de Q450.00" } } })));

    const dos = (await registrarPago(entrada(o.id, { monto: "450.00" }), agente)) as { pagoId: string };
    assert.equal(await estado(o.id), "en_revision");
    const r2 = await verificarPago(dos.pagoId, admin);
    assert.ok(r2.ok && r2.cubierto);
    assert.equal(await estado(o.id), "pagado");
    assert.equal((await stock(o.productoId)).apartado, 0);
  });

  test("con dos comprobantes en revisión, confirmar uno parcial no suelta el pedido", async () => {
    const o = await pedido();
    const a = (await registrarPago(entrada(o.id, { monto: "600.00" }), agente)) as { pagoId: string };
    await registrarPago(entrada(o.id, { monto: "650.00" }), agente);
    await verificarPago(a.pagoId, admin);
    assert.equal(await estado(o.id), "en_revision"); // todavía queda uno por revisar
    assert.deepEqual((await resumenPagos(o.id)).enRevision, 65_000);
  });

  test("rechazar: pide motivo, devuelve el pedido a pendiente de pago y manda el mensaje (editable)", async () => {
    const o = await pedido();
    const { pagoId } = (await registrarPago(entrada(o.id), agente)) as { pagoId: string };
    assert.equal((await rechazarPago(pagoId, "  ", admin)).ok, false);
    assert.equal((await rechazarPago(pagoId, "No aparece", agente)).ok, false); // sin permiso

    const r = await rechazarPago(pagoId, "La boleta no coincide", verificador, "Hola, la boleta no coincide con el monto. ¿Puede revisarla?");
    assert.ok(r.ok && r.aviso.estado === "enviado");
    assert.equal(await estado(o.id), "pendiente_pago");
    const p = await db.payment.findUniqueOrThrow({ where: { id: pagoId } });
    assert.deepEqual([p.estado, p.motivoRechazo], ["rechazado", "La boleta no coincide"]);
    assert.equal((await stock(o.productoId)).apartado, 2); // el apartado sigue hasta que venza
    await db.message.findFirstOrThrow({ where: { pedidoId: o.id, texto: "Hola, la boleta no coincide con el monto. ¿Puede revisarla?" } });

    // Se puede registrar otro comprobante y la misma imagen rechazada se puede volver a usar.
    assert.ok((await registrarPago(entrada(o.id), agente)).ok);
  });

  test("sin mensaje de texto editado se usa el de Ajustes con el motivo; apagado no manda nada", async () => {
    const o = await pedido();
    const { pagoId } = (await registrarPago(entrada(o.id), agente)) as { pagoId: string };
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: { pago_rechazado: { activo: false, texto: "x" } } } });
    assert.equal((await configMensajes()).pago_rechazado.activo, false);
    const r = await rechazarPago(pagoId, "Monto menor", admin);
    assert.ok(r.ok && r.aviso.estado === "apagado");
    assert.equal(await db.message.count({ where: { pedidoId: o.id, texto: { contains: "Monto menor" } } }), 0);

    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: { pago_rechazado: { texto: "Rechazado {codigo}: {motivo}" } } } });
    const o2 = await pedido();
    const p2 = (await registrarPago(entrada(o2.id), agente)) as { pagoId: string };
    await rechazarPago(p2.pagoId, "Referencia falsa", admin);
    await db.message.findFirstOrThrow({ where: { pedidoId: o2.id, texto: `Rechazado ${o2.codigo}: Referencia falsa` } });
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: Prisma.JsonNull } });
  });

  test("dos personas confirmando el mismo pago a la vez: solo una lo logra", async () => {
    const o = await pedido();
    const { pagoId } = (await registrarPago(entrada(o.id), agente)) as { pagoId: string };
    const r = await Promise.all([verificarPago(pagoId, admin), verificarPago(pagoId, verificador)]);
    assert.equal(r.filter((x) => x.ok).length, 1);
    assert.equal(await estado(o.id), "pagado");
    assert.equal((await stock(o.productoId)).cantidad, 8); // se descontó una sola vez
  });

  test("un pedido cancelado ya no acepta confirmar pagos pendientes", async () => {
    const o = await pedido();
    const { pagoId } = (await registrarPago(entrada(o.id), agente)) as { pagoId: string };
    assert.equal((await cambiarEstado({ pedidoId: o.id, a: "cancelado", quien: { usuarioId: admin.id } })).ok, true);
    assert.equal((await verificarPago(pagoId, admin)).ok, false);
    assert.equal((await stock(o.productoId)).apartado, 0);
  });
});
