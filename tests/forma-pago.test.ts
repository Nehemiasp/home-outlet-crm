import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { Prisma, type TipoPago } from "@/generated/prisma/client";
import { procesarEventoPasarela } from "@/lib/pagos-tarjeta/cobros";
import { pasarelaSimulada } from "@/lib/pagos-tarjeta/simulada";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { registrarPago } from "@/lib/pedidos/pagos";
import { cambiarFormaDePago, datosPanel, enviarAlCliente, guardarBorrador, type ActorPedidos } from "@/lib/pedidos/pedidos";
import type { EntradaPedido } from "@/lib/pedidos/tipos";

// Necesita la base de datos (npm run db). La forma de pago se elige al crear el pedido. Lo que crea lleva el prefijo PRUEBA-FP y se borra al final.

describe("forma de pago al crear el pedido (con base de datos)", () => {
  let admin: ActorPedidos;
  let contactoId: string;
  let conv: string;
  let ubicA: string;
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  const previo = process.env.PASARELA;
  let n = 0;

  const ajustar = (d: object) => db.ajustesPedidos.update({ where: { id: "pedidos" }, data: d });
  const producto = async (stock = 10) => {
    const p = await db.product.create({ data: { sku: `PRUEBA-FP-${++n}`, nombre: `PRUEBA-FP ${n}`, precio: 62_500 } });
    await db.stock.create({ data: { productoId: p.id, ubicacionId: ubicA, cantidad: stock } });
    return p;
  };
  const entrada = (productoId: string, sobre: Partial<EntradaPedido> = {}): EntradaPedido => ({
    pedidoId: null, conversacionId: conv, cliente: { nombre: "PRUEBA-FP cliente", telefono: "", municipio: "" },
    lineas: [{ productoId, cantidad: 2, ubicacionId: null }], entrega: "recoger", direccion: "", referencia: "", descuento: null, descuentoMotivo: "", notas: "", ...sobre,
  });
  /** Guarda un borrador con esa forma de pago y devuelve su id. */
  const borrador = async (metodoPago: TipoPago | null, sobre: Partial<EntradaPedido> = {}, stock = 10) => {
    const p = await producto(stock);
    const g = await guardarBorrador(entrada(p.id, { metodoPago, ...sobre }), admin);
    assert.ok(g.ok, g.ok ? "" : g.error);
    return { id: g.pedidoId, productoId: p.id };
  };
  const enviar = (id: string) => enviarAlCliente(id, admin, { modo: "enviar", sobrePedido: false });
  const textos = async () => (await db.message.findMany({ where: { conversacionId: conv }, orderBy: { fecha: "asc" } })).map((m) => m.texto ?? "");
  const ultimo = async () => (await textos()).at(-1) ?? "";
  const cobros = (pedidoId: string) => db.cobroTarjeta.findMany({ where: { pedidoId }, orderBy: { creado: "asc" } });
  const externoDe = (url: string) => url.split("/").pop()!;

  before(async () => {
    process.env.PASARELA = "simulada";
    originales = await obtenerAjustesPedidos();
    const a = await db.user.create({ data: { nombre: "Admin FP", correo: "prueba-fp-admin@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    admin = { id: a.id, nombre: a.nombre, rol: "admin" };
    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-FP A" } })).id;
    await ajustar({ inventario: "separado", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicA, metodos: ["transferencia", "deposito", "efectivo_en_tienda", "tarjeta"], mensajes: Prisma.JsonNull, horasReserva: 24 });
    await db.bankAccount.create({ data: { banco: "PRUEBA-FP Banco", tipo: "monetaria", numero: "123-456789-0", titular: "Home Outlet" } });
    await db.shippingZone.create({ data: { nombre: "PRUEBA-FP Zona", municipios: ["PRUEBA-FP Ciudad"], costo: 2_500, tiempo: "1 día" } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-FP cliente" } })).id;
    await db.channelIdentity.create({ data: { contactoId, canal: "simulado", externalContactId: "prueba-fp-sim" } });
    conv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date(), atendidaPor: "asistente" } })).id;
  });
  after(async () => {
    previo === undefined ? delete process.env.PASARELA : (process.env.PASARELA = previo);
    await ajustar({ inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, metodos: originales.metodos, horasReserva: originales.horasReserva, mensajes: (originales.mensajes as Prisma.InputJsonValue | null) ?? Prisma.JsonNull });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-FP-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-FP" } } });
    await db.shippingZone.deleteMany({ where: { nombre: { startsWith: "PRUEBA-FP" } } });
    await db.bankAccount.deleteMany({ where: { banco: { startsWith: "PRUEBA-FP" } } });
    await db.activityLog.deleteMany({ where: { OR: [{ usuarioId: admin.id }, { accion: { in: ["cobro_tarjeta_por_revisar"] }, detalle: { path: ["pedido"], string_starts_with: "PRUEBA-FP" } }] } });
    await db.user.deleteMany({ where: { id: admin.id } });
    await db.$disconnect();
  });

  test("sin forma de pago se puede guardar el borrador, pero no enviarlo al cliente", async () => {
    const b = await borrador(null);
    const r = await enviar(b.id);
    assert.ok(!r.ok && /forma de pago/.test(r.error));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).estado, "borrador", "no se apartó nada");
  });

  test("transferencia o depósito: el resumen lleva las cuentas y no se abre ningún cobro", async () => {
    for (const metodo of ["transferencia", "deposito"] as const) {
      const b = await borrador(metodo);
      const r = await enviar(b.id);
      assert.ok(r.ok, r.ok ? "" : r.error);
      assert.match(r.texto, /Cuentas|PRUEBA-FP Banco/i);
      assert.equal((await ultimo()).includes("/pagar/"), false);
      assert.equal((await cobros(b.id)).length, 0);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).metodoPago, metodo);
    }
  });

  test("tarjeta: se abre el cobro por el total y el resumen trae el enlace, sin cuentas", async () => {
    const b = await borrador("tarjeta");
    const r = await enviar(b.id);
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [cobro] = await cobros(b.id);
    assert.ok(cobro);
    assert.deepEqual({ monto: cobro.monto, estado: cobro.estado }, { monto: 125_000, estado: "creado" });
    assert.ok(r.texto.includes(cobro.url), "el enlace va dentro del resumen");
    assert.match(r.texto, /tarjeta de crédito o débito/);
    assert.equal(r.texto.includes("PRUEBA-FP Banco"), false, "no se mandan cuentas bancarias");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).estado, "pendiente_pago");
    // y al pagar, el pedido queda pagado solo
    assert.deepEqual(await procesarEventoPasarela({ externoId: cobro.externoId, estado: "pagado", monto: 125_000 }, pasarelaSimulada), { ok: true, estado: "pagado" });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).estado, "pagado");
  });

  test("efectivo: «pagará al recoger», sin cuentas ni enlace, y no vale para un envío", async () => {
    const b = await borrador("efectivo_en_tienda");
    const r = await enviar(b.id);
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.match(r.texto, /Pagará en efectivo al recoger/);
    assert.equal(r.texto.includes("PRUEBA-FP Banco") || r.texto.includes("/pagar/"), false);
    const p = await producto();
    const envio = await guardarBorrador(entrada(p.id, { metodoPago: "efectivo_en_tienda", entrega: "envio", cliente: { nombre: "PRUEBA-FP cliente", telefono: "", municipio: "PRUEBA-FP Ciudad" }, direccion: "Calle 1" }), admin);
    assert.ok(!envio.ok && /efectivo en tienda/i.test(envio.error));
  });

  test("una forma apagada en Ajustes, o la tarjeta sin pasarela, se rechaza al guardar", async () => {
    const p = await producto();
    await ajustar({ metodos: ["transferencia"] });
    const apagada = await guardarBorrador(entrada(p.id, { metodoPago: "deposito" }), admin);
    assert.ok(!apagada.ok && /no está activo/.test(apagada.error));
    await ajustar({ metodos: ["transferencia", "deposito", "efectivo_en_tienda", "tarjeta"] });
    delete process.env.PASARELA;
    const sin = await guardarBorrador(entrada(p.id, { metodoPago: "tarjeta" }), admin);
    assert.ok(!sin.ok && /pasarela/.test(sin.error));
    process.env.PASARELA = "simulada";
  });

  test("si el pedido no se puede apartar (no alcanza la existencia), el cobro abierto se cancela y no queda enlace vivo", async () => {
    const b = await borrador("tarjeta", {}, 1); // pide 2 y hay 1
    const r = await enviar(b.id);
    assert.equal(r.ok, false);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).estado, "borrador");
    const lista = await cobros(b.id);
    assert.ok(lista.every((c) => c.estado === "cancelado"), JSON.stringify(lista.map((c) => c.estado)));
  });

  test("el panel ofrece las formas activas, y la tarjeta solo si hay pasarela", async () => {
    const con = await datosPanel(conv, admin);
    assert.ok(con.ok);
    assert.deepEqual(con.ok && con.datos.metodosPago.map((m) => m.id), ["transferencia", "deposito", "efectivo_en_tienda", "tarjeta"]);
    delete process.env.PASARELA;
    const sin = await datosPanel(conv, admin);
    assert.deepEqual(sin.ok && sin.datos.metodosPago.map((m) => m.id), ["transferencia", "deposito", "efectivo_en_tienda"]);
    process.env.PASARELA = "simulada";
  });

  test("el texto del resumen que el administrador edita en Ajustes se usa de verdad", async () => {
    await ajustar({ mensajes: { resumen: { activo: true, texto: "TEXTO PROPIO {codigo} · {cuentas}" } } });
    const b = await borrador("transferencia");
    const r = await enviar(b.id);
    assert.ok(r.ok && /TEXTO PROPIO PRUEBA-FP|TEXTO PROPIO .*-\d+/.test(r.texto), r.ok ? r.texto : r.error);
    await ajustar({ mensajes: Prisma.JsonNull });
  });

  describe("cambiar la forma de pago de un pedido ya enviado", () => {
    test("de transferencia a tarjeta: abre el cobro y le manda al cliente el resumen con el enlace", async () => {
      const b = await borrador("transferencia");
      assert.ok((await enviar(b.id)).ok);
      const r = await cambiarFormaDePago(b.id, "tarjeta", admin);
      assert.ok(r.ok, r.ok ? "" : r.error);
      assert.equal(r.ok && r.aviso.estado, "enviado");
      const [cobro] = await cobros(b.id);
      assert.deepEqual({ monto: cobro!.monto, estado: cobro!.estado }, { monto: 125_000, estado: "creado" });
      assert.ok((await ultimo()).includes(cobro!.url));
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).metodoPago, "tarjeta");
    });

    test("de tarjeta a depósito: anula el cobro, manda las cuentas, y si aun así pagan el enlace queda EN REVISIÓN (no se pierde)", async () => {
      const b = await borrador("tarjeta");
      assert.ok((await enviar(b.id)).ok);
      const [cobro] = await cobros(b.id);
      const r = await cambiarFormaDePago(b.id, "deposito", admin);
      assert.ok(r.ok, r.ok ? "" : r.error);
      assert.equal((await cobros(b.id))[0]!.estado, "cancelado");
      assert.match(await ultimo(), /PRUEBA-FP Banco/);

      const tarde = await procesarEventoPasarela({ externoId: cobro!.externoId, estado: "pagado", monto: 125_000 }, pasarelaSimulada);
      assert.deepEqual(tarde, { ok: true, estado: "pagado", revisar: true });
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: b.id } })).estado, "pendiente_pago", "no se confirma solo");
      const pago = await db.payment.findFirstOrThrow({ where: { pedidoId: b.id } });
      assert.deepEqual({ tipo: pago.tipo, estado: pago.estado, monto: pago.monto }, { tipo: "tarjeta", estado: "en_revision", monto: 125_000 });
      assert.deepEqual(await procesarEventoPasarela({ externoId: cobro!.externoId, estado: "pagado", monto: 125_000 }, pasarelaSimulada), { ok: true, estado: "repetido" });
    });

    test("con un pago parcial verificado, el cobro nuevo es por lo que falta", async () => {
      const b = await borrador("transferencia");
      assert.ok((await enviar(b.id)).ok);
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
      const reg = await registrarPago({ pedidoId: b.id, tipo: "transferencia", banco: "PRUEBA-FP Banco", referencia: `REF-${Date.now()}`, monto: "500.00", fecha: hoy }, { ...admin });
      assert.ok(reg.ok);
      const bloqueado = await cambiarFormaDePago(b.id, "tarjeta", admin);
      assert.ok(!bloqueado.ok, "con un comprobante por revisar no se cambia");
      const { verificarPago } = await import("@/lib/pedidos/pagos");
      assert.ok((await verificarPago(reg.ok ? reg.pagoId : "", admin)).ok);
      assert.ok((await cambiarFormaDePago(b.id, "tarjeta", admin)).ok);
      assert.equal((await cobros(b.id)).at(-1)!.monto, 75_000);
    });

    test("no se puede cambiar si el pedido no espera pago, si ya tiene esa forma o si la nueva no sirve", async () => {
      const borr = await borrador("transferencia");
      const enBorrador = await cambiarFormaDePago(borr.id, "deposito", admin);
      assert.ok(!enBorrador.ok && /pendiente de pago/.test(enBorrador.error));
      const b = await borrador("transferencia");
      assert.ok((await enviar(b.id)).ok);
      const igual = await cambiarFormaDePago(b.id, "transferencia", admin);
      assert.ok(!igual.ok && /ya tiene esa forma/.test(igual.error));
      const p = await producto();
      const g = await guardarBorrador(entrada(p.id, { metodoPago: "transferencia", entrega: "envio", cliente: { nombre: "PRUEBA-FP cliente", telefono: "", municipio: "PRUEBA-FP Ciudad" }, direccion: "Calle 1" }), admin);
      assert.ok(g.ok);
      assert.ok((await enviar(g.ok ? g.pedidoId : "")).ok);
      const efectivoEnEnvio = await cambiarFormaDePago(g.ok ? g.pedidoId : "", "efectivo_en_tienda", admin);
      assert.ok(!efectivoEnEnvio.ok && /efectivo en tienda/i.test(efectivoEnEnvio.error));
    });
  });
});
