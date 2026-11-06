import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { aplicarDatos, textoCuentas } from "@/lib/plantillas";
import { borrarCuenta, borrarZona, guardarAjustesPedidos, guardarCuenta, guardarZona, listarCuentas, obtenerAjustesPedidos, separarMunicipios } from "@/lib/pedidos/ajustes";
import { costoEnvio, zonaPara, type Zona } from "@/lib/pedidos/envio";
import { disponibleProducto, textoExistencia } from "@/lib/pedidos/existencias";
import { cambiarEstado } from "@/lib/pedidos/flujo";
import { ESTADOS, siguientes, transicionValida } from "@/lib/pedidos/estados";
import { METODOS, metodosSeleccionables } from "@/lib/pedidos/metodos";
import type { EstadoPedido } from "@/generated/prisma/client";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-PED y se borra al final.

describe("estados del pedido", () => {
  test("solo se permiten las transiciones de la tabla", () => {
    assert.equal(transicionValida("borrador", "pendiente_pago", "recoger"), true);
    assert.equal(transicionValida("borrador", "pagado", "recoger"), false);
    assert.equal(transicionValida("pendiente_pago", "en_revision", "envio"), true);
    assert.equal(transicionValida("en_revision", "pendiente_pago", "envio"), true); // pago rechazado o parcial
    assert.equal(transicionValida("vencido", "pendiente_pago", "envio"), true); // reactivar
    assert.equal(transicionValida("entregado", "cancelado", "envio"), false);
    assert.equal(transicionValida("cancelado", "pendiente_pago", "envio"), false);
  });

  test("«listo para recoger» solo con recoger y «enviado» solo con envío", () => {
    assert.deepEqual(siguientes("preparando", "recoger"), ["listo_para_recoger", "cancelado"]);
    assert.deepEqual(siguientes("preparando", "envio"), ["enviado", "cancelado"]);
    assert.equal(transicionValida("preparando", "enviado", "recoger"), false);
  });

  test("todos los estados están en la tabla y ninguno vuelve a borrador", () => {
    for (const de of ESTADOS) for (const a of siguientes(de, "envio")) assert.notEqual(a, "borrador");
    assert.equal(ESTADOS.length, 10);
  });
});

describe("métodos de pago", () => {
  test("la tarjeta se puede encender solo si hay una pasarela (se valida al guardar los ajustes; ver tests/tarjeta.test.ts)", () => {
    assert.ok(METODOS.some((m) => m.id === "tarjeta" && m.disponible && !m.porDefecto));
    assert.deepEqual(metodosSeleccionables(), ["transferencia", "deposito", "efectivo_en_tienda", "tarjeta"]);
    assert.deepEqual(METODOS.filter((m) => m.porDefecto).map((m) => m.id), ["transferencia", "deposito"]);
  });
});

describe("zonas de envío", () => {
  const zona = (nombre: string, municipios: string[], costo: number, activa = true): Zona => ({ id: nombre, nombre, municipios, costo, tiempo: "1 día", activa });
  const zonas = [zona("Morales", ["Morales"], 3500), zona("Barrios", ["Puerto Barrios", "Santo Tomás de Castilla"], 1500), zona("Resto", [], 4500), zona("Cerrada", ["Livingston"], 100, false)];

  test("encuentra la zona sin importar mayúsculas ni tildes y cae en «resto del país»", () => {
    assert.equal(zonaPara(zonas, "MORALES")?.nombre, "Morales");
    assert.equal(zonaPara(zonas, "santo tomas de castilla")?.nombre, "Barrios");
    assert.equal(zonaPara(zonas, "Los Amates")?.nombre, "Resto");
    assert.equal(zonaPara(zonas, "Livingston")?.nombre, "Resto"); // la zona desactivada no cuenta
    assert.equal(zonaPara(zonas, null)?.nombre, "Resto");
    assert.equal(zonaPara(zonas.filter((z) => z.nombre !== "Resto"), "Los Amates"), null);
  });

  test("envío gratis a partir del monto, solo si está encendido", () => {
    assert.equal(costoEnvio({ costo: 3500 }, 49_999, 50_000), 3500);
    assert.equal(costoEnvio({ costo: 3500 }, 50_000, 50_000), 0);
    assert.equal(costoEnvio({ costo: 3500 }, 1_000_000, null), 3500);
  });

  test("separa los municipios por coma o por línea sin repetir", () => {
    assert.deepEqual(separarMunicipios("Morales, Los Amates\nMorales ,  "), ["Morales", "Los Amates"]);
  });
});

describe("{cuentas} en las respuestas rápidas", () => {
  test("lista solo las cuentas activas, una por línea", () => {
    const t = textoCuentas([
      { banco: "Banco A", tipo: "monetaria", numero: "000-0", titular: "Home Outlet", activa: true },
      { banco: "Banco B", tipo: "ahorro", numero: "111-1", titular: "Home Outlet", activa: false },
      { banco: "Banco C", tipo: "ahorro", numero: "222-2", titular: "Home Outlet", activa: true },
    ]);
    assert.equal(t, "Banco A · Monetaria 000-0 · Home Outlet\nBanco C · Ahorro 222-2 · Home Outlet");
    const base = { nombre: "Home Outlet", horario: null, direccion: null };
    assert.equal(aplicarDatos("Pague a:\n{cuentas}", { ...base, cuentas: t }), `Pague a:\n${t}`);
    assert.equal(aplicarDatos("{cuentas}", { ...base, cuentas: "" }), "[Cuentas bancarias: pendiente de confirmar]");
  });
});

describe("pedidos (con base de datos)", () => {
  let actor: { id: string; nombre: string };
  let contactoId: string;
  let ubicA: string;
  let ubicB: string;
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  let n = 0;

  const producto = async (stockA: number, stockB = 0) => {
    const p = await db.product.create({ data: { sku: `PRUEBA-PED-${++n}`, nombre: `PRUEBA-PED producto ${n}`, precio: 10_000 } });
    await db.stock.createMany({ data: [{ productoId: p.id, ubicacionId: ubicA, cantidad: stockA }, { productoId: p.id, ubicacionId: ubicB, cantidad: stockB }] });
    return p;
  };
  const pedido = (p: { id: string; sku: string; nombre: string }, cantidad: number, entrega: "recoger" | "envio" = "recoger", ubicacionId: string | null = ubicA) =>
    db.order.create({
      data: {
        codigo: `PRUEBA-PED-${Date.now()}-${++n}`,
        contactoId,
        canal: "simulado",
        entrega,
        lineas: { create: { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: 10_000, cantidad, ubicacionId } },
      },
    });
  const stock = async (productoId: string) => {
    const filas = await db.stock.findMany({ where: { productoId }, orderBy: { ubicacionId: "asc" } });
    const de = (u: string) => filas.find((f) => f.ubicacionId === u)!;
    return { a: { cantidad: de(ubicA).cantidad, apartado: de(ubicA).apartado }, b: { cantidad: de(ubicB).cantidad, apartado: de(ubicB).apartado } };
  };
  const ir = (pedidoId: string, a: EstadoPedido, extra: { sobrePedido?: boolean } = {}) => cambiarEstado({ pedidoId, a, quien: { usuarioId: actor.id }, ...extra });
  const configurar = (inventario: "separado" | "compartido") =>
    db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario, ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicB } });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    actor = await db.user.create({ data: { nombre: "Admin de pedidos", correo: "prueba-pedidos-actor@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-PED contacto" } })).id;
    // A y B se llaman distinto de las tiendas reales, y A queda primero por orden alfabético.
    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-PED A" } })).id;
    ubicB = (await db.location.create({ data: { nombre: "PRUEBA-PED B" } })).id;
  });
  after(async () => {
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, prefijo: originales.prefijo, horasReserva: originales.horasReserva, descuentoMaxAgente: originales.descuentoMaxAgente, metodos: originales.metodos, envioGratisDesde: originales.envioGratisDesde } });
    await db.order.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { nombre: "PRUEBA-PED contacto" } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-PED-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-PED" } } });
    await db.bankAccount.deleteMany({ where: { banco: { startsWith: "PRUEBA-PED" } } });
    await db.shippingZone.deleteMany({ where: { nombre: { startsWith: "PRUEBA-PED" } } });
    await db.activityLog.deleteMany({ where: { usuarioId: actor.id } });
    await db.user.deleteMany({ where: { id: actor.id } });
    await db.$disconnect();
  });

  test("inventario separado: enviar aparta, y lo que no alcanza no se aparta", async () => {
    await configurar("separado");
    const p = await producto(5, 5);
    const uno = await pedido(p, 3);
    assert.deepEqual(await ir(uno.id, "pendiente_pago"), { ok: true, estado: "pendiente_pago" });
    assert.deepEqual(await stock(p.id), { a: { cantidad: 5, apartado: 3 }, b: { cantidad: 5, apartado: 0 } });
    assert.ok((await db.order.findUniqueOrThrow({ where: { id: uno.id } })).reservadoHasta! > new Date());

    const dos = await pedido(p, 3);
    const r = await ir(dos.id, "pendiente_pago");
    assert.equal(r.ok, false); // en B hay 5, pero la línea sale de A y el modo es separado
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: dos.id } })).estado, "borrador");
    assert.equal((await stock(p.id)).a.apartado, 3);
  });

  test("sobre pedido: un admin puede apartar de más", async () => {
    await configurar("separado");
    const p = await producto(2);
    const o = await pedido(p, 5);
    assert.equal((await ir(o.id, "pendiente_pago")).ok, false);
    assert.equal((await ir(o.id, "pendiente_pago", { sobrePedido: true })).ok, true);
    assert.equal((await stock(p.id)).a.apartado, 5);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).sobrePedido, true);
    assert.equal(disponibleProducto(await db.stock.findMany({ where: { productoId: p.id } })), 0); // nunca negativo
  });

  test("pagar descuenta de la existencia y libera lo apartado; cancelar un pagado la repone", async () => {
    await configurar("separado");
    const p = await producto(10);
    const o = await pedido(p, 4);
    await ir(o.id, "pendiente_pago");
    await ir(o.id, "en_revision");
    assert.deepEqual((await stock(p.id)).a, { cantidad: 10, apartado: 4 });
    await ir(o.id, "pagado");
    assert.deepEqual((await stock(p.id)).a, { cantidad: 6, apartado: 0 });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).reservadoHasta, null);
    await ir(o.id, "preparando");
    await ir(o.id, "cancelado");
    assert.deepEqual((await stock(p.id)).a, { cantidad: 10, apartado: 0 });
  });

  test("cancelar o vencer libera lo apartado, y un vencido se puede reactivar", async () => {
    await configurar("separado");
    const p = await producto(5);
    const o = await pedido(p, 2);
    await ir(o.id, "pendiente_pago");
    assert.equal((await stock(p.id)).a.apartado, 2);
    await cambiarEstado({ pedidoId: o.id, a: "vencido", quien: "sistema" });
    assert.equal((await stock(p.id)).a.apartado, 0);
    await ir(o.id, "pendiente_pago");
    assert.equal((await stock(p.id)).a.apartado, 2);
    await ir(o.id, "cancelado");
    assert.equal((await stock(p.id)).a.apartado, 0);
    const eventos = await db.orderEvent.findMany({ where: { pedidoId: o.id }, orderBy: { fecha: "asc" } });
    assert.deepEqual(eventos.map((e) => e.aEstado), ["pendiente_pago", "vencido", "pendiente_pago", "cancelado"]);
    assert.equal(eventos[1]!.origen, "sistema");
    assert.equal(eventos[0]!.usuarioId, actor.id);
  });

  test("inventario compartido: toma de la ubicación de despacho y completa con la otra, partiendo la línea", async () => {
    await configurar("compartido");
    const p = await producto(2, 4);
    const o = await pedido(p, 5);
    assert.equal((await ir(o.id, "pendiente_pago")).ok, true);
    assert.deepEqual(await stock(p.id), { a: { cantidad: 2, apartado: 2 }, b: { cantidad: 4, apartado: 3 } });
    const lineas = await db.orderItem.findMany({ where: { pedidoId: o.id }, orderBy: { cantidad: "asc" } });
    assert.deepEqual(lineas.map((l) => [l.ubicacionId, l.cantidad]), [[ubicA, 2], [ubicB, 3]]);

    await ir(o.id, "pagado");
    assert.deepEqual(await stock(p.id), { a: { cantidad: 0, apartado: 0 }, b: { cantidad: 1, apartado: 0 } });

    const mas = await pedido(p, 2);
    assert.equal((await ir(mas.id, "pendiente_pago")).ok, false); // solo queda 1 en total
    assert.match(textoExistencia(await db.stock.findMany({ where: { productoId: p.id } })), /^Disponible 1 · Apartado 0$/);
  });

  test("inventario separado ignora la otra ubicación aunque tenga existencia", async () => {
    await configurar("separado");
    const p = await producto(2, 4);
    const o = await pedido(p, 3);
    assert.equal((await ir(o.id, "pendiente_pago")).ok, false);
    assert.deepEqual(await stock(p.id), { a: { cantidad: 2, apartado: 0 }, b: { cantidad: 4, apartado: 0 } });
  });

  test("dos pedidos al mismo tiempo no apartan la misma unidad", async () => {
    for (const modo of ["separado", "compartido"] as const) {
      await configurar(modo);
      const p = await producto(5);
      const [x, y] = await Promise.all([pedido(p, 3), pedido(p, 3)]);
      const r = await Promise.all([ir(x!.id, "pendiente_pago"), ir(y!.id, "pendiente_pago")]);
      assert.equal(r.filter((v) => v.ok).length, 1, `con inventario ${modo} solo uno debe pasar`);
      assert.equal((await stock(p.id)).a.apartado, 3);
    }
  });

  test("no se salta la tabla de transiciones ni se cambia dos veces a la vez", async () => {
    await configurar("separado");
    const p = await producto(5);
    const o = await pedido(p, 1);
    assert.equal((await ir(o.id, "pagado")).ok, false);
    assert.equal((await ir(o.id, "listo_para_recoger")).ok, false);
    const [a, b] = await Promise.all([ir(o.id, "pendiente_pago"), ir(o.id, "cancelado")]);
    assert.equal([a, b].filter((v) => v.ok).length, 1);
    assert.equal((await ir("no-existe", "cancelado")).ok, false);
  });

  test("ajustes: valida el prefijo, el descuento y que la tarjeta no se pueda encender", async () => {
    const base = { prefijo: "HO-", horasReserva: 24, descuentoMaxAgente: 0, inventario: "separado" as const, metodos: ["transferencia", "deposito"], envioGratisDesde: "", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicB };
    assert.equal((await guardarAjustesPedidos({ ...base, prefijo: "ho pedidos" }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, descuentoMaxAgente: 101 }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, horasReserva: 0 }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, metodos: ["transferencia", "tarjeta"] }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, metodos: [] }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, envioGratisDesde: "mucho" }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, ubicacionEnvioId: "no-existe" }, actor)).ok, false);
    assert.equal((await guardarAjustesPedidos({ ...base, prefijo: " ho- ", horasReserva: 48, descuentoMaxAgente: 5, envioGratisDesde: "500.00" }, actor)).ok, true);
    const a = await obtenerAjustesPedidos();
    assert.deepEqual([a.prefijo, a.horasReserva, a.descuentoMaxAgente, a.envioGratisDesde], ["HO-", 48, 5, 50_000]);
  });

  test("cuentas y zonas: se validan, se guardan y se borran", async () => {
    const cuenta = { banco: "PRUEBA-PED Banco", tipo: "monetaria" as const, numero: "000-000000-0", titular: "Home Outlet", activa: true };
    assert.equal((await guardarCuenta(null, { ...cuenta, banco: " " }, actor)).ok, false);
    assert.equal((await guardarCuenta(null, { ...cuenta, numero: "1" }, actor)).ok, false);
    assert.equal((await guardarCuenta(null, { ...cuenta, titular: "" }, actor)).ok, false);
    assert.equal((await guardarCuenta(null, cuenta, actor)).ok, true);
    const c = (await listarCuentas()).find((x) => x.banco === cuenta.banco)!;
    assert.equal((await guardarCuenta(c.id, { ...cuenta, activa: false }, actor)).ok, true);
    assert.equal((await db.bankAccount.findUniqueOrThrow({ where: { id: c.id } })).activa, false);
    assert.equal((await guardarCuenta("no-existe", cuenta, actor)).ok, false);
    assert.equal((await borrarCuenta(c.id, actor)).ok, true);
    assert.equal(await db.bankAccount.count({ where: { id: c.id } }), 0);

    const zona = { nombre: "PRUEBA-PED Zona", municipios: "Morales, Los Amates", costo: "35.00", tiempo: "1 a 2 días", activa: true };
    assert.equal((await guardarZona(null, { ...zona, costo: "gratis" }, actor)).ok, false);
    assert.equal((await guardarZona(null, { ...zona, tiempo: "" }, actor)).ok, false);
    assert.equal((await guardarZona(null, { ...zona, costo: "0" }, actor)).ok, true);
    const z = await db.shippingZone.findFirstOrThrow({ where: { nombre: zona.nombre } });
    assert.deepEqual([z.costo, z.municipios], [0, ["Morales", "Los Amates"]]);
    assert.equal((await borrarZona(z.id, actor)).ok, true);
  });
});
