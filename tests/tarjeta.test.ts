import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { POST as webhook } from "@/app/api/pagos/webhook/route";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { crearEnlaceDePago, procesarEventoPasarela, tarjetaActiva } from "@/lib/pagos-tarjeta/cobros";
import { pasarela } from "@/lib/pagos-tarjeta";
import { CABECERA_FIRMA, eventoFirmado, pasarelaSimulada } from "@/lib/pagos-tarjeta/simulada";
import { guardarAjustesPedidos, obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { cambiarEstado } from "@/lib/pedidos/flujo";
import { registrarPago, verificarPago, type ActorPagos } from "@/lib/pedidos/pagos";

// Necesita la base de datos (npm run db). Pago con tarjeta con la pasarela SIMULADA. Lo que crea lleva el prefijo PRUEBA-TJ y se borra al final.

const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });

describe("pasarela simulada", () => {
  test("solo existe con PASARELA=simulada y nunca en producción", () => {
    const antes = { p: process.env.PASARELA, n: process.env.NODE_ENV };
    try {
      delete process.env.PASARELA;
      assert.equal(pasarela(), null);
      process.env.PASARELA = "simulada";
      assert.equal(pasarela(), pasarelaSimulada);
      (process.env as Record<string, string>).NODE_ENV = "production";
      assert.equal(pasarela(), null, "en producción la simulada no existe, aunque la pidan");
      process.env.PASARELA = "otra-que-no-existe";
      (process.env as Record<string, string>).NODE_ENV = "development";
      assert.equal(pasarela(), null);
    } finally {
      antes.p === undefined ? delete process.env.PASARELA : (process.env.PASARELA = antes.p);
      (process.env as Record<string, string | undefined>).NODE_ENV = antes.n;
    }
  });

  test("valida la firma del aviso contra el cuerpo crudo", () => {
    const { cuerpo, firma } = eventoFirmado({ externoId: "sim_1", estado: "pagado", monto: 100 });
    assert.equal(pasarelaSimulada.verificarWebhook(cuerpo, new Headers({ [CABECERA_FIRMA]: firma })), true);
    assert.equal(pasarelaSimulada.verificarWebhook(cuerpo.replace("100", "1"), new Headers({ [CABECERA_FIRMA]: firma })), false, "un monto cambiado invalida la firma");
    assert.equal(pasarelaSimulada.verificarWebhook(cuerpo, new Headers({ [CABECERA_FIRMA]: "00".repeat(32) })), false);
    assert.equal(pasarelaSimulada.verificarWebhook(cuerpo, new Headers()), false);
    assert.equal(pasarelaSimulada.verificarWebhook(cuerpo, new Headers({ [CABECERA_FIRMA]: "no-es-hexadecimal" })), false);
  });

  test("entiende los eventos de cobro y descarta lo demás", () => {
    assert.deepEqual(pasarelaSimulada.interpretarWebhook(JSON.stringify({ externoId: "sim_1", estado: "pagado", monto: 5000, referencia: "A1" })), { externoId: "sim_1", estado: "pagado", monto: 5000, referencia: "A1" });
    for (const malo of ["no es json", "{}", JSON.stringify({ externoId: "x", estado: "reembolsado", monto: 1 }), JSON.stringify({ externoId: "x", estado: "pagado", monto: -5 }), JSON.stringify({ externoId: "x", estado: "pagado", monto: 1.5 })]) {
      assert.equal(pasarelaSimulada.interpretarWebhook(malo), null, malo);
    }
  });
});

describe("pago con tarjeta de un pedido (con base de datos)", () => {
  let admin: ActorPagos;
  let contactoId: string;
  let conv: string;
  let ubicA: string;
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  const previo = process.env.PASARELA;
  let n = 0;

  /** Un pedido pendiente de pago de Q1,250.00 con 2 unidades apartadas. */
  const pedido = async () => {
    const p = await db.product.create({ data: { sku: `PRUEBA-TJ-${++n}`, nombre: `PRUEBA-TJ ${n}`, precio: 62_500 } });
    await db.stock.create({ data: { productoId: p.id, ubicacionId: ubicA, cantidad: 10 } });
    const o = await db.order.create({
      data: { codigo: `PRUEBA-TJ-${Date.now()}-${n}`, contactoId, conversacionId: conv, canal: "simulado", subtotal: 125_000, total: 125_000, lineas: { create: { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: 62_500, cantidad: 2, ubicacionId: ubicA } } },
    });
    assert.equal((await cambiarEstado({ pedidoId: o.id, a: "pendiente_pago", quien: { usuarioId: admin.id } })).ok, true);
    return { ...o, productoId: p.id };
  };
  const stock = (productoId: string) => db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId, ubicacionId: ubicA } } });
  const estado = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).estado;
  const enlace = async (pedidoId: string) => {
    const r = await crearEnlaceDePago(pedidoId, admin);
    assert.ok(r.ok, r.ok ? "" : r.error);
    return r;
  };
  const externoDe = (url: string) => url.split("/").pop()!;
  const textos = async () => (await db.message.findMany({ where: { conversacionId: conv }, orderBy: { fecha: "asc" } })).map((m) => m.texto ?? "");

  before(async () => {
    process.env.PASARELA = "simulada";
    originales = await obtenerAjustesPedidos();
    const a = await db.user.create({ data: { nombre: "Admin TJ", correo: "prueba-tj-admin@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    admin = { id: a.id, nombre: a.nombre, rol: "admin" };
    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-TJ A" } })).id;
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: "separado", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicA, metodos: ["transferencia", "deposito", "tarjeta"], mensajes: Prisma.JsonNull } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-TJ cliente" } })).id;
    await db.channelIdentity.create({ data: { contactoId, canal: "simulado", externalContactId: "prueba-tj-sim" } });
    conv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date(), atendidaPor: "asistente" } })).id;
  });
  after(async () => {
    previo === undefined ? delete process.env.PASARELA : (process.env.PASARELA = previo);
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, metodos: originales.metodos, mensajes: (originales.mensajes as Prisma.InputJsonValue | null) ?? Prisma.JsonNull } });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-TJ-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-TJ" } } });
    await db.activityLog.deleteMany({ where: { OR: [{ usuarioId: admin.id }, { accion: { in: ["cobro_tarjeta_por_revisar", "cobro_tarjeta_fallido", "verificar_pago"] }, detalle: { path: ["pedido"], string_starts_with: "PRUEBA-TJ" } }] } });
    await db.user.deleteMany({ where: { id: admin.id } });
    await db.$disconnect();
  });

  test("el enlace se crea por el saldo, se le manda al cliente y el pedido no cambia de estado", async () => {
    assert.equal(await tarjetaActiva(), true);
    const o = await pedido();
    const r = await enlace(o.id);
    assert.equal(r.monto, 125_000);
    assert.equal(r.reutilizado, false);
    assert.match(r.url, /\/pagar\/sim_[0-9a-f-]{36}$/);
    const cobro = await db.cobroTarjeta.findUniqueOrThrow({ where: { externoId: externoDe(r.url) } });
    assert.deepEqual({ pedidoId: cobro.pedidoId, monto: cobro.monto, estado: cobro.estado, pasarela: cobro.pasarela }, { pedidoId: o.id, monto: 125_000, estado: "creado", pasarela: "simulada" });
    assert.ok((await textos()).some((t) => t.includes(r.url) && t.includes("Q1,250.00")), "el cliente recibió el enlace");
    assert.equal(await estado(o.id), "pendiente_pago");
    assert.equal((await db.payment.count({ where: { pedidoId: o.id } })), 0, "todavía no hay ningún pago registrado");
  });

  test("pedir el enlace otra vez por el mismo saldo reutiliza el cobro abierto (no quedan dos vivos)", async () => {
    const o = await pedido();
    const a = await enlace(o.id);
    const b = await enlace(o.id);
    assert.equal(b.reutilizado, true);
    assert.equal(b.url, a.url);
    assert.equal(await db.cobroTarjeta.count({ where: { pedidoId: o.id } }), 1);
  });

  test("con un pago parcial verificado, el enlace es por lo que falta", async () => {
    const o = await pedido();
    const reg = await registrarPago({ pedidoId: o.id, tipo: "transferencia", banco: "Banco PRUEBA-TJ", referencia: `REF-${Date.now()}`, monto: "500.00", fecha: hoy }, admin);
    assert.ok(reg.ok);
    const bloqueado = await crearEnlaceDePago(o.id, admin);
    assert.ok(!bloqueado.ok && /pendiente de pago/.test(bloqueado.error), "con un comprobante en revisión el pedido ya no está pendiente de pago: no se pide otro cobro");
    assert.ok((await verificarPago(reg.ok ? reg.pagoId : "", admin)).ok);
    const r = await enlace(o.id);
    assert.equal(r.monto, 75_000);
  });

  test("no se puede enviar si el pedido no espera pago o la tarjeta está apagada; sin pasarela hace falta pegar el enlace", async () => {
    const o = await pedido();
    await cambiarEstado({ pedidoId: o.id, a: "cancelado", quien: { usuarioId: admin.id } });
    const cancelado = await crearEnlaceDePago(o.id, admin);
    assert.ok(!cancelado.ok && /pendiente de pago/.test(cancelado.error));

    const o2 = await pedido();
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { metodos: ["transferencia", "deposito"] } });
    const apagada = await crearEnlaceDePago(o2.id, admin);
    assert.ok(!apagada.ok && /no está activo/.test(apagada.error));
    assert.equal(await tarjetaActiva(), false);
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { metodos: ["transferencia", "deposito", "tarjeta"] } });

    delete process.env.PASARELA;
    try {
      const sinEnlace = await crearEnlaceDePago(o2.id, admin);
      assert.ok(!sinEnlace.ok && /enlace de pago/.test(sinEnlace.error));
      const pegado = await crearEnlaceDePago(o2.id, admin, "https://app.paggoapp.com/pay/PRUEBA-T");
      assert.ok(pegado.ok && pegado.url === "https://app.paggoapp.com/pay/PRUEBA-T" && !pegado.reutilizado);
      const otraVez = await crearEnlaceDePago(o2.id, admin); // sin enlace nuevo: se reenvía el abierto
      assert.ok(otraVez.ok && otraVez.reutilizado && otraVez.url === "https://app.paggoapp.com/pay/PRUEBA-T");
    } finally {
      process.env.PASARELA = "simulada";
    }
    assert.equal((await crearEnlaceDePago((await pedido()).id, { ...admin, rol: "agente" })).ok, true, "cualquiera que vea el pedido puede mandar el enlace (la acción valida la visibilidad)");
  });

  test("al pagarse: se registra un pago de tarjeta, se confirma solo, el pedido queda pagado y se descuenta la existencia", async () => {
    const o = await pedido();
    const r = await enlace(o.id);
    const externoId = externoDe(r.url);
    assert.deepEqual(await procesarEventoPasarela({ externoId, estado: "pagado", monto: 125_000, referencia: "AUT-123" }, pasarelaSimulada), { ok: true, estado: "pagado" });

    assert.equal(await estado(o.id), "pagado");
    const pagos = await db.payment.findMany({ where: { pedidoId: o.id } });
    assert.equal(pagos.length, 1);
    assert.deepEqual({ tipo: pagos[0]!.tipo, estado: pagos[0]!.estado, monto: pagos[0]!.monto, referencia: pagos[0]!.referencia, banco: pagos[0]!.banco, verificadoPorId: pagos[0]!.verificadoPorId }, { tipo: "tarjeta", estado: "verificado", monto: 125_000, referencia: "AUT-123", banco: "simulada", verificadoPorId: null });
    assert.ok(pagos[0]!.verificadoEn, "queda la fecha de la confirmación");
    const s = await stock(o.productoId);
    assert.deepEqual({ cantidad: s.cantidad, apartado: s.apartado }, { cantidad: 8, apartado: 0 });
    assert.equal((await db.cobroTarjeta.findUniqueOrThrow({ where: { externoId } })).estado, "pagado");
    assert.ok((await textos()).some((t) => /Confirmamos su pago/.test(t)), "el cliente recibió la confirmación");
    const evento = await db.orderEvent.findFirstOrThrow({ where: { pedidoId: o.id, aEstado: "pagado" } });
    assert.equal(evento.origen, "sistema");
  });

  test("el mismo aviso repetido, o cinco a la vez, no registra el pago más de una vez", async () => {
    const o = await pedido();
    const externoId = externoDe((await enlace(o.id)).url);
    const e = { externoId, estado: "pagado" as const, monto: 125_000 };
    const r = await Promise.all(Array.from({ length: 5 }, () => procesarEventoPasarela(e, pasarelaSimulada)));
    assert.equal(r.filter((x) => x.ok && x.estado === "pagado").length, 1);
    assert.equal(r.filter((x) => x.ok && x.estado === "repetido").length, 4);
    assert.equal(await db.payment.count({ where: { pedidoId: o.id } }), 1);
    assert.deepEqual(await procesarEventoPasarela(e, pasarelaSimulada), { ok: true, estado: "repetido" });
    assert.equal((await stock(o.productoId)).cantidad, 8, "la existencia se descontó una sola vez");
  });

  test("un monto distinto al pedido NO se confirma solo: queda en revisión con aviso para una persona", async () => {
    const o = await pedido();
    const externoId = externoDe((await enlace(o.id)).url);
    const r = await procesarEventoPasarela({ externoId, estado: "pagado", monto: 100_000 }, pasarelaSimulada);
    assert.deepEqual(r, { ok: true, estado: "pagado", revisar: true });
    assert.equal(await estado(o.id), "pendiente_pago");
    const pago = await db.payment.findFirstOrThrow({ where: { pedidoId: o.id } });
    assert.deepEqual({ estado: pago.estado, monto: pago.monto }, { estado: "en_revision", monto: 100_000 });
    assert.ok(await db.activityLog.findFirst({ where: { accion: "cobro_tarjeta_por_revisar", entidadId: pago.id } }));
    assert.equal((await stock(o.productoId)).cantidad, 10, "no se descontó nada");
  });

  test("un pago que llega cuando el pedido ya no espera pago tampoco se aplica solo", async () => {
    const o = await pedido();
    const externoId = externoDe((await enlace(o.id)).url);
    await cambiarEstado({ pedidoId: o.id, a: "cancelado", quien: { usuarioId: admin.id } });
    const r = await procesarEventoPasarela({ externoId, estado: "pagado", monto: 125_000 }, pasarelaSimulada);
    assert.deepEqual(r, { ok: true, estado: "pagado", revisar: true });
    assert.equal(await estado(o.id), "cancelado");
    assert.equal((await db.payment.findFirstOrThrow({ where: { pedidoId: o.id } })).estado, "en_revision");
  });

  test("un pago rechazado por el banco no registra ningún pago y se puede mandar otro enlace", async () => {
    const o = await pedido();
    const a = await enlace(o.id);
    assert.deepEqual(await procesarEventoPasarela({ externoId: externoDe(a.url), estado: "fallido", monto: 125_000 }, pasarelaSimulada), { ok: true, estado: "fallido" });
    assert.equal(await db.payment.count({ where: { pedidoId: o.id } }), 0);
    assert.equal(await estado(o.id), "pendiente_pago");
    const b = await enlace(o.id);
    assert.equal(b.reutilizado, false);
    assert.notEqual(b.url, a.url, "el cobro fallido no se reutiliza");
  });

  test("un cobro que no existe se rechaza sin tocar nada", async () => {
    const r = await procesarEventoPasarela({ externoId: "sim_no-existe", estado: "pagado", monto: 1 }, pasarelaSimulada);
    assert.deepEqual(r, { ok: false, error: "Cobro desconocido." });
  });

  test("el webhook HTTP exige la firma, procesa el aviso y ignora lo que no es un cobro", async () => {
    const o = await pedido();
    const externoId = externoDe((await enlace(o.id)).url);
    const pedir = (cuerpo: string, firma?: string) => webhook(new Request("http://x/api/pagos/webhook", { method: "POST", body: cuerpo, headers: firma ? { [CABECERA_FIRMA]: firma } : {} }));

    const mal = eventoFirmado({ externoId, estado: "pagado", monto: 125_000 });
    assert.equal((await pedir(mal.cuerpo)).status, 401, "sin firma");
    assert.equal((await pedir(mal.cuerpo, "ab".repeat(32))).status, 401, "firma equivocada");
    assert.equal(await estado(o.id), "pendiente_pago", "nada se procesó");

    assert.equal((await pedir(mal.cuerpo, mal.firma)).status, 200);
    assert.equal(await estado(o.id), "pagado");
    assert.equal((await pedir(mal.cuerpo, mal.firma)).status, 200, "repetido: el proveedor recibe 200 y no reintenta");
    assert.equal(await db.payment.count({ where: { pedidoId: o.id } }), 1);

    const ajeno = JSON.stringify({ tipo: "otra-cosa" });
    assert.equal((await pedir(ajeno, eventoFirmado({ externoId: "x", estado: "pagado", monto: 1 }).firma)).status, 401, "la firma es del cuerpo: otro cuerpo, otra firma");
    const firmaAjeno = (await import("@/lib/pagos-tarjeta/simulada")).firmar(ajeno);
    assert.equal((await pedir(ajeno, firmaAjeno)).status, 200, "firmado pero no es un cobro: se acepta y se ignora");

    delete process.env.PASARELA;
    assert.equal((await pedir(mal.cuerpo, mal.firma)).status, 404, "sin pasarela la ruta no existe");
    process.env.PASARELA = "simulada";
  });

  test("encender la tarjeta en Ajustes ya no exige pasarela", async () => {
    const a = await obtenerAjustesPedidos();
    const entrada = { prefijo: a.prefijo, horasReserva: a.horasReserva, diasCotizacion: a.diasCotizacion, paqueterias: a.paqueterias, descuentoMaxAgente: a.descuentoMaxAgente, inventario: a.inventario, metodos: ["transferencia", "tarjeta"], envioGratisDesde: a.envioGratisDesde !== null ? (a.envioGratisDesde / 100).toFixed(2) : "", costoContraEntrega: (a.costoContraEntrega / 100).toFixed(2), envioGratisSinContraEntrega: a.envioGratisSinContraEntrega, ubicacionRecogerId: a.ubicacionRecogerId, ubicacionEnvioId: a.ubicacionEnvioId };
    delete process.env.PASARELA;
    try {
      assert.deepEqual(await guardarAjustesPedidos(entrada, admin), { ok: true });
    } finally {
      process.env.PASARELA = "simulada";
    }
    assert.deepEqual(await guardarAjustesPedidos(entrada, admin), { ok: true });
  });
});
