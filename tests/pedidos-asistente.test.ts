import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { ejecutarHerramienta } from "@/lib/ia/herramientas";
import { afirmaPagoConfirmado, derivacionPrevia, revisarSalida, TEXTO_PAGO_NO_CONFIRMADO } from "@/lib/ia/reglas";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import type { EstadoPedido } from "@/generated/prisma/client";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-AS y se borra al final.

describe("reglas del código sobre pagos", () => {
  test("una imagen es un posible comprobante solo si hay un pedido esperando pago", () => {
    assert.equal(derivacionPrevia("", "image", { pedidoPendiente: true }), "posible comprobante de pago");
    assert.equal(derivacionPrevia("", "image", { pedidoPendiente: false }), "el cliente envió una imagen, audio o video");
    assert.equal(derivacionPrevia("", "image"), "el cliente envió una imagen, audio o video");
    assert.equal(derivacionPrevia("", "audio", { pedidoPendiente: true }), "el cliente envió una imagen, audio o video"); // un audio no es comprobante
  });

  test("«ya pagué» pasa siempre a un asesor, en español y en inglés", () => {
    for (const t of ["Ya pagué", "ya deposité", "Hice el depósito hace un rato", "ya hice mi transferencia", "I already paid", "I made the payment"]) assert.ok(derivacionPrevia(t, "text"), t);
    assert.match(derivacionPrevia("Ya pagué", "text", { pedidoPendiente: true }) ?? "", /posible comprobante/);
    assert.equal(derivacionPrevia("¿Puedo pagar con transferencia?", "text"), null);
    assert.equal(derivacionPrevia("¿Ya confirmaron mi pago?", "text"), null); // eso lo responde el asistente con estado_pedido
  });

  test("detecta cuando una respuesta afirma un pago confirmado, y no cuando lo niega o lo deja en revisión", () => {
    for (const t of ["Su pago está confirmado.", "Ya confirmamos su depósito.", "Recibimos su pago, gracias.", "Your payment is confirmed.", "Su transferencia fue acreditada."]) assert.equal(afirmaPagoConfirmado(t), true, t);
    for (const t of [
      "Todavía no vemos el pago del pedido HO-1. Falta Q450.00.",
      "Recibimos su comprobante y está en revisión. Le avisamos en cuanto se confirme.",
      "Un asesor revisará su pago y se lo confirmará.",
      "No hemos confirmado su depósito.",
      "Para confirmar su pago envíe el comprobante.",
      "Puede pagar por transferencia o depósito.",
      "Tenemos 5 unidades disponibles.",
    ])
      assert.equal(afirmaPagoConfirmado(t), false, t);
  });

  test("regla de salida: sin pago verificado se cambia el texto y se pasa a un asesor", () => {
    const sin = revisarSalida("Su pago del pedido HO-1 está confirmado.", false);
    assert.deepEqual([sin.texto, !!sin.derivar], [TEXTO_PAGO_NO_CONFIRMADO, true]);
    assert.deepEqual(revisarSalida("Su pago del pedido HO-1 está confirmado.", true), { texto: "Su pago del pedido HO-1 está confirmado." });
    assert.deepEqual(revisarSalida("Todavía no vemos el pago.", false), { texto: "Todavía no vemos el pago." });
  });
});

describe("herramienta estado_pedido (con base de datos)", () => {
  let propio: string;
  let ajeno: string;
  let original: Awaited<ReturnType<typeof obtenerAjustesPedidos>>["inventario"];
  let n = 0;
  const ctx = (contactoId: string | null) => ({ conversacionId: null, contactoId, sandbox: true });
  const leer = async (contactoId: string | null, codigo?: string) => JSON.parse((await ejecutarHerramienta("estado_pedido", codigo ? { codigo } : {}, ctx(contactoId))).contenido) as { pedido: null | Record<string, unknown> };
  const pedido = (contactoId: string, estado: EstadoPedido, sobre: object = {}) =>
    db.order.create({ data: { codigo: `PRUEBA-AS-${++n}`, contactoId, canal: "simulado", estado, subtotal: 125_000, total: 125_000, ...sobre } });

  before(async () => {
    original = (await obtenerAjustesPedidos()).inventario;
    propio = (await db.contact.create({ data: { nombre: "PRUEBA-AS propio" } })).id;
    ajeno = (await db.contact.create({ data: { nombre: "PRUEBA-AS ajeno" } })).id;
    await db.bankAccount.create({ data: { banco: "PRUEBA-AS Banco", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet" } });
  });
  after(async () => {
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: original } });
    await db.order.deleteMany({ where: { codigo: { startsWith: "PRUEBA-AS-" } } });
    await db.contact.deleteMany({ where: { nombre: { startsWith: "PRUEBA-AS" } } });
    await db.bankAccount.deleteMany({ where: { banco: { startsWith: "PRUEBA-AS" } } });
    await db.product.deleteMany({ where: { sku: "PRUEBA-AS-P" } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-AS" } } });
    await db.$disconnect();
  });

  test("sin cliente o sin pedidos no devuelve nada", async () => {
    assert.equal((await leer(null)).pedido, null);
    assert.equal((await leer(propio)).pedido, null);
    await pedido(propio, "borrador"); // un borrador todavía no existe para el cliente
    assert.equal((await leer(propio)).pedido, null);
  });

  test("un pedido esperando pago incluye las cuentas y no permite decir que está pagado", async () => {
    const o = await pedido(propio, "pendiente_pago");
    const { pedido: p } = await leer(propio);
    assert.ok(p);
    assert.deepEqual([p.codigo, p.estado, p.pago_confirmado, p.total, p.saldo, p.pago], [o.codigo, "pendiente_pago", false, "Q1,250.00", "Q1,250.00", "sin_pago"]);
    assert.match(String(p.cuentas), /PRUEBA-AS Banco · Monetaria 000-000000-0 · Home Outlet/);
  });

  test("sin código devuelve el último abierto, y con código el que se pida si es suyo", async () => {
    const pagado = await pedido(propio, "pagado", { creada: new Date(Date.now() + 1000) });
    const { pedido: ultimo } = await leer(propio);
    assert.equal(ultimo?.codigo, pagado.codigo);
    assert.deepEqual([ultimo?.pago_confirmado, ultimo?.cuentas], [true, undefined]); // las cuentas solo salen mientras espera pago
    const anterior = await db.order.findFirstOrThrow({ where: { contactoId: propio, estado: "pendiente_pago" } });
    assert.equal((await leer(propio, anterior.codigo.toLowerCase())).pedido?.codigo, anterior.codigo);
  });

  test("un código de otra persona responde igual que uno que no existe", async () => {
    const delOtro = await pedido(ajeno, "pagado");
    const r = await leer(propio, delOtro.codigo);
    assert.equal(r.pedido, null);
    assert.equal(JSON.stringify(r), JSON.stringify(await leer(propio, "NO-EXISTE-1")));
    assert.equal((await leer(ajeno)).pedido?.codigo, delOtro.codigo); // y el otro cliente sí ve el suyo
  });

  test("el pago parcial muestra el saldo y no cuenta como pagado", async () => {
    const o = await pedido(ajeno, "pendiente_pago", { creada: new Date(Date.now() + 5000) });
    await db.payment.create({ data: { pedidoId: o.id, tipo: "transferencia", banco: "B", referencia: "R", monto: 80_000, fechaPago: new Date(), estado: "verificado" } });
    const { pedido: p } = await leer(ajeno);
    assert.deepEqual([p?.codigo, p?.saldo, p?.pago, p?.pago_confirmado], [o.codigo, "Q450.00", "parcial", false]);
  });

  test("el asistente no recibe la existencia: ni buscar_productos ni ver_producto la traen (Home Outlet no la promete)", async () => {
    const a = await db.location.create({ data: { nombre: "PRUEBA-AS A" } });
    const b = await db.location.create({ data: { nombre: "PRUEBA-AS B" } });
    const prod = await db.product.create({ data: { sku: "PRUEBA-AS-P", nombre: "PRUEBA-AS producto", precio: 1000 } });
    await db.stock.createMany({ data: [{ productoId: prod.id, ubicacionId: a.id, cantidad: 3, apartado: 1 }, { productoId: prod.id, ubicacionId: b.id, cantidad: 4 }] });
    const ver = (await ejecutarHerramienta("ver_producto", { id: prod.id }, ctx(null))).contenido;
    const buscar = (await ejecutarHerramienta("buscar_productos", { texto: "PRUEBA-AS producto" }, ctx(null))).contenido;
    assert.deepEqual(Object.keys(JSON.parse(ver)).sort(), ["categoria", "descripcion", "foto", "id", "nombre", "precio", "sku"]);
    assert.ok(JSON.parse(buscar).some((p: { nombre: string }) => p.nombre === "PRUEBA-AS producto"));
    for (const t of [ver, buscar]) assert.doesNotMatch(t, /existencia|cantidad|apartado|"(Total|PRUEBA-AS A)"/);
  });
});
