import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { agruparLineas, rellenar, textoResumen } from "@/lib/pedidos/mensajes";
import { descartarBorrador, enviarAlCliente, guardarBorrador, previsualizar, type ActorPedidos } from "@/lib/pedidos/pedidos";
import type { EntradaPedido } from "@/lib/pedidos/tipos";
import { calcularTotales, dentroDelLimite, saldoDe } from "@/lib/pedidos/totales";
import type { Rol } from "@/lib/permisos";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-CR y se borra al final.

describe("totales y descuentos", () => {
  const lineas = [{ precio: 10_000, cantidad: 2 }, { precio: 2_500, cantidad: 1 }]; // Q225.00

  test("subtotal, descuento en monto o porcentaje, envío y total", () => {
    assert.deepEqual(calcularTotales(lineas, null, 0), { subtotal: 22_500, descuentoMonto: 0, costoEnvio: 0, total: 22_500 });
    assert.equal(calcularTotales(lineas, { tipo: "monto", centavos: 5_000 }, 3_500).total, 21_000);
    assert.equal(calcularTotales(lineas, { tipo: "porcentaje", porcentaje: 10 }, 0).descuentoMonto, 2_250);
    assert.equal(calcularTotales([{ precio: 333, cantidad: 1 }], { tipo: "porcentaje", porcentaje: 10 }, 0).descuentoMonto, 33); // redondea al centavo
  });

  test("el descuento nunca pasa del subtotal ni deja el total en negativo", () => {
    const t = calcularTotales(lineas, { tipo: "monto", centavos: 999_999 }, 1_500);
    assert.deepEqual(t, { subtotal: 22_500, descuentoMonto: 22_500, costoEnvio: 1_500, total: 1_500 });
  });

  test("el límite del agente se compara contra el monto ya calculado, y el saldo no baja de cero", () => {
    assert.equal(dentroDelLimite(2_250, 22_500, 10), true);
    assert.equal(dentroDelLimite(2_251, 22_500, 10), false);
    assert.equal(dentroDelLimite(1, 22_500, 0), false);
    assert.equal(dentroDelLimite(0, 22_500, 0), true);
    assert.equal(saldoDe(125_000, 80_000), 45_000);
    assert.equal(saldoDe(10_000, 12_000), 0);
  });
});

describe("mensaje del resumen", () => {
  const linea = (productoId: string, nombre: string, precio: number, cantidad: number) => ({ productoId, sku: nombre, nombre, precio, cantidad });
  test("junta las líneas partidas por ubicación y arma el texto con totales y pie", () => {
    const lineas = [linea("a", "Pantalla Android", 95_000, 1), linea("a", "Pantalla Android", 95_000, 1), linea("b", "Cámara", 25_000, 1)];
    assert.deepEqual(agruparLineas(lineas).map((l) => [l.nombre, l.cantidad]), [["Pantalla Android", 2], ["Cámara", 1]]);
    const t = textoResumen({ codigo: "HO-000123", lineas, descuentoMonto: 0, costoEnvio: 3_500, total: 218_500, entrega: "envio", municipio: "Morales", tienda: null }, "Pie");
    assert.equal(t, "Pedido HO-000123\n\n2 × Pantalla Android   Q1,900.00\n1 × Cámara   Q250.00\nEnvío a Morales   Q35.00\nTotal   Q2,185.00\n\nPie");
    assert.match(textoResumen({ codigo: "X", lineas, descuentoMonto: 5_000, costoEnvio: 0, total: 1, entrega: "recoger", municipio: null, tienda: { nombre: "Tienda Mixco", direccion: "4 calle 11-47" } }, "p"), /Descuento {3}-Q50\.00\nRecoger en Tienda Mixco: 4 calle 11-47\n/);
    assert.match(textoResumen({ codigo: "X", lineas, descuentoMonto: 0, costoEnvio: 0, total: 1, entrega: "recoger", municipio: null, tienda: null }, "p"), /\nRecoger en tienda\n/);
  });

  test("rellena las variables y deja vacías las que no se mandan", () => {
    assert.equal(rellenar("Pedido {codigo}. {guia}", { codigo: "HO-1" }), "Pedido HO-1.");
    assert.equal(rellenar("Líneas\n{cuentas}\nfin", { cuentas: "A\nB" }), "Líneas\nA\nB\nfin");
  });
});

describe("crear y enviar pedidos (con base de datos)", () => {
  let admin: ActorPedidos;
  let agente: ActorPedidos;
  let convSim: string;
  let convTikTok: string;
  let contactoId: string;
  let ubicA: string;
  let ubicB: string;
  let producto: { id: string };
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  let n = 0;

  const base = (sobre: Partial<EntradaPedido> = {}): EntradaPedido => ({
    pedidoId: null, conversacionId: convSim,
    cliente: { nombre: "PRUEBA-CR cliente", telefono: "", departamento: "", municipio: "" },
    lineas: [{ productoId: producto.id, cantidad: 2, ubicacionId: null }],
    entrega: "recoger", direccion: "", referencia: "", descuento: null, descuentoMotivo: "", notas: "", metodoPago: "transferencia", ...sobre,
  });
  const nuevoProducto = async (stockA: number, stockB: number) => {
    const p = await db.product.create({ data: { sku: `PRUEBA-CR-${++n}`, nombre: `PRUEBA-CR producto ${n}`, precio: 10_000 } });
    await db.stock.createMany({ data: [{ productoId: p.id, ubicacionId: ubicA, cantidad: stockA }, { productoId: p.id, ubicacionId: ubicB, cantidad: stockB }] });
    return p;
  };
  const apartado = async (productoId: string, u: string) => (await db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId, ubicacionId: u } } })).apartado;
  const ajustes = (d: object) => db.ajustesPedidos.update({ where: { id: "pedidos" }, data: d });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    const u = (nombre: string, rol: Rol) => db.user.create({ data: { nombre, correo: `prueba-cr-${rol}@homeoutlet.test`, passwordHash: "x", rol } });
    const [a, g] = await Promise.all([u("Admin PRUEBA-CR", "admin"), u("Agente PRUEBA-CR", "agente")]);
    admin = { id: a.id, nombre: a.nombre, rol: "admin" };
    agente = { id: g.id, nombre: g.nombre, rol: "agente" };

    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-CR A" } })).id;
    ubicB = (await db.location.create({ data: { nombre: "PRUEBA-CR B" } })).id;
    // Aquí se prueba el costo de la zona: el envío gratis con las demás formas de pago (el de fábrica) va apagado (ver tests/contra-entrega.test.ts).
    await ajustes({ inventario: "separado", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicB, descuentoMaxAgente: 0, envioGratisDesde: null, horasReserva: 24, prefijo: "PRCR-", envioGratisSinContraEntrega: false });
    producto = await nuevoProducto(10, 10);

    const contacto = await db.contact.create({ data: { nombre: "PRUEBA-CR cliente" } });
    contactoId = contacto.id;
    await db.channelIdentity.createMany({ data: [{ contactoId, canal: "simulado", externalContactId: "prueba-cr-sim" }, { contactoId, canal: "tiktok", externalContactId: "prueba-cr-tt" }] });
    process.env.CHANNELS_ENABLED = "simulado"; // «TikTok» hace de canal sin adaptador activo (no depende de lo que haya en el .env de desarrollo)
    const ahora = new Date();
    convSim = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: ahora } })).id;
    convTikTok = (await db.conversation.create({ data: { contactoId, canal: "tiktok", lastInboundAt: ahora } })).id;

    await db.shippingZone.create({ data: { nombre: "PRUEBA-CR Zona", departamentos: ["Petén"], municipios: ["Flores"], costo: 2_500, tiempo: "1 día" } });
    await db.bankAccount.create({ data: { banco: "PRUEBA-CR Banco", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet" } });
  });
  after(async () => {
    await ajustes({ inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, descuentoMaxAgente: originales.descuentoMaxAgente, envioGratisDesde: originales.envioGratisDesde, horasReserva: originales.horasReserva, prefijo: originales.prefijo, siguienteNumero: originales.siguienteNumero, envioGratisSinContraEntrega: originales.envioGratisSinContraEntrega });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-CR-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-CR" } } });
    await db.shippingZone.deleteMany({ where: { nombre: { startsWith: "PRUEBA-CR" } } });
    await db.bankAccount.deleteMany({ where: { banco: { startsWith: "PRUEBA-CR" } } });
    const ids = [admin.id, agente.id];
    await db.activityLog.deleteMany({ where: { usuarioId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  test("el servidor calcula los totales y valida lo que llega", async () => {
    const v = await previsualizar(base(), admin);
    assert.ok(v.ok && v.vista.subtotal === 20_000 && v.vista.total === 20_000 && !v.vista.sinExistencia);

    assert.equal((await previsualizar(base({ lineas: [] }), admin)).ok, false);
    assert.equal((await previsualizar(base({ lineas: [{ productoId: producto.id, cantidad: 0, ubicacionId: null }] }), admin)).ok, false);
    assert.equal((await previsualizar(base({ lineas: [{ productoId: "no-existe", cantidad: 1, ubicacionId: null }] }), admin)).ok, false);
    assert.equal((await previsualizar(base({ lineas: [{ productoId: producto.id, cantidad: 1, ubicacionId: "no-existe" }] }), admin)).ok, false);

    // Dos líneas del mismo producto y ubicación se juntan.
    const dos = await previsualizar(base({ lineas: [{ productoId: producto.id, cantidad: 1, ubicacionId: null }, { productoId: producto.id, cantidad: 2, ubicacionId: null }] }), admin);
    assert.ok(dos.ok && dos.vista.lineas.length === 1 && dos.vista.lineas[0]!.cantidad === 3);
  });

  test("envío: pide municipio y dirección, calcula la zona y el costo, y respeta el envío gratis", async () => {
    const e = base({ entrega: "envio", cliente: { nombre: "PRUEBA-CR cliente", telefono: "", departamento: "Petén", municipio: "Flores" }, direccion: "Calle 1" });
    const v = await previsualizar(e, admin);
    assert.ok(v.ok && v.vista.costoEnvio === 2_500 && v.vista.total === 22_500 && v.vista.zona?.nombre === "PRUEBA-CR Zona");
    assert.equal((await previsualizar({ ...e, direccion: " " }, admin)).ok, false);
    assert.equal((await previsualizar({ ...e, cliente: { ...e.cliente, municipio: "" } }, admin)).ok, false);
    assert.equal((await previsualizar({ ...e, cliente: { ...e.cliente, departamento: "" } }, admin)).ok, false);
    // el municipio tiene que ser del departamento: «Morales» no está en Petén
    const fuera = await previsualizar({ ...e, cliente: { ...e.cliente, municipio: "Morales" } }, admin);
    assert.ok(!fuera.ok && /municipio/i.test(fuera.error));

    await ajustes({ envioGratisDesde: 20_000 });
    const gratis = await previsualizar(e, admin);
    assert.ok(gratis.ok && gratis.vista.costoEnvio === 0 && gratis.vista.total === 20_000);
    await ajustes({ envioGratisDesde: null });
  });

  test("descuento: pide motivo, el agente tiene tope y el admin no", async () => {
    const d = { tipo: "monto" as const, valor: "50.00" };
    assert.equal((await previsualizar(base({ descuento: d }), admin)).ok, false); // sin motivo
    const conMotivo = base({ descuento: d, descuentoMotivo: "Cliente frecuente" });
    const a = await previsualizar(conMotivo, admin);
    assert.ok(a.ok && a.vista.descuentoMonto === 5_000 && a.vista.total === 15_000);
    assert.equal((await previsualizar(conMotivo, agente)).ok, false); // el tope del agente es 0 %

    await ajustes({ descuentoMaxAgente: 25 });
    assert.equal((await previsualizar(conMotivo, agente)).ok, true); // Q50 de Q200 = 25 %
    assert.equal((await previsualizar({ ...conMotivo, descuento: { tipo: "porcentaje", valor: "26" } }, agente)).ok, false);
    assert.equal((await previsualizar({ ...conMotivo, descuento: { tipo: "porcentaje", valor: "101" } }, admin)).ok, false);
    await ajustes({ descuentoMaxAgente: 0 });
  });

  test("avisa cuando la existencia no alcanza", async () => {
    const v = await previsualizar(base({ lineas: [{ productoId: producto.id, cantidad: 11, ubicacionId: null }] }), agente);
    assert.ok(v.ok && v.vista.sinExistencia && v.vista.avisos.length > 0);
  });

  test("guardar borrador: código consecutivo con el prefijo, contacto actualizado y edición del borrador", async () => {
    const c = base({ cliente: { nombre: "PRUEBA-CR cliente", telefono: "5555 0101", departamento: "petén", municipio: "FLORES" } });
    const uno = await guardarBorrador(c, agente);
    assert.ok(uno.ok);
    assert.match(uno.codigo, /^PRCR-\d{6}$/);
    const dos = await guardarBorrador(base(), agente);
    assert.ok(dos.ok);
    assert.equal(Number(dos.codigo.slice(5)), Number(uno.codigo.slice(5)) + 1);

    const contacto = await db.contact.findUniqueOrThrow({ where: { id: contactoId } });
    assert.deepEqual([contacto.telefono, contacto.departamento, contacto.municipio], ["+50255550101", "Petén", "Flores"]); // se guardan con el nombre oficial

    const editado = await guardarBorrador({ ...c, pedidoId: uno.pedidoId, lineas: [{ productoId: producto.id, cantidad: 5, ubicacionId: null }] }, agente);
    assert.ok(editado.ok && editado.codigo === uno.codigo);
    const o = await db.order.findUniqueOrThrow({ where: { id: uno.pedidoId }, include: { lineas: true, eventos: true } });
    assert.deepEqual([o.estado, o.total, o.lineas.length, o.lineas[0]!.cantidad, o.creadoPorId], ["borrador", 50_000, 1, 5, agente.id]);
    assert.match(o.lineas[0]!.nombre, /^PRUEBA-CR producto/); // el nombre y el precio se copian del catálogo
    assert.equal(o.eventos.length, 1);
    assert.equal(await apartado(producto.id, ubicA), 0); // un borrador no aparta

    assert.equal((await guardarBorrador({ ...c, cliente: { ...c.cliente, telefono: "123" } }, agente)).ok, false);
    assert.equal((await guardarBorrador({ ...c, pedidoId: "no-existe" }, agente)).ok, false);
    assert.equal((await guardarBorrador({ ...c, cliente: { ...c.cliente, nombre: " " } }, agente)).ok, false);
    const otro = await db.contact.create({ data: { nombre: "PRUEBA-CR otro", telefono: "+50255550202" } });
    assert.equal((await guardarBorrador({ ...c, cliente: { ...c.cliente, telefono: "5555 0202" } }, agente)).ok, false); // ya es de otro contacto
    await db.contact.delete({ where: { id: otro.id } });
  });

  test("enviar por el canal: aparta, manda el resumen con las cuentas y lo enlaza al pedido", async () => {
    const p = await nuevoProducto(10, 10);
    const g = await guardarBorrador(base({ lineas: [{ productoId: p.id, cantidad: 3, ubicacionId: null }] }), agente);
    assert.ok(g.ok);
    const r = await enviarAlCliente(g.pedidoId, agente, { modo: "enviar", sobrePedido: false });
    assert.ok(r.ok);
    assert.match(r.texto, new RegExp(`^Pedido ${g.codigo}\\n\\n3 × ${p.nombre.replace(/[-]/g, "\\-")}   Q300\\.00\\nRecoger en PRUEBA-CR A\\n`)); // la tienda de Ajustes (sin dirección, solo el nombre)
    assert.match(r.texto, /PRUEBA-CR Banco · Monetaria 000-000000-0 · Home Outlet/);
    assert.match(r.texto, /Apartamos sus productos por 24 horas\./);
    assert.match(r.texto, /Envíenos la foto del comprobante por este chat/);

    const o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } });
    assert.equal(o.estado, "pendiente_pago");
    assert.ok(o.reservadoHasta && o.reservadoHasta.getTime() > Date.now() + 23 * 3_600_000);
    assert.equal(await apartado(p.id, ubicA), 3); // «recoger» sale de la ubicación A
    const m = await db.message.findFirstOrThrow({ where: { pedidoId: g.pedidoId } });
    assert.deepEqual([m.conversacionId, m.autor, m.direccion, m.enviadoPorId, m.texto], [convSim, "asesor", "saliente", agente.id, r.texto]);

    assert.equal((await enviarAlCliente(g.pedidoId, agente, { modo: "enviar", sobrePedido: false })).ok, false); // ya se envió
    assert.equal(await apartado(p.id, ubicA), 3); // y no se aparta dos veces
  });

  test("recoger en otra tienda: las líneas salen de ahí y el resumen lleva su dirección", async () => {
    await db.location.update({ where: { id: ubicB }, data: { direccion: "PRUEBA-CR 4 calle 11-47" } });
    const p = await nuevoProducto(0, 5);
    const g = await guardarBorrador(base({ recogerEnId: ubicB, lineas: [{ productoId: p.id, cantidad: 2, ubicacionId: null }] }), agente);
    assert.ok(g.ok);
    const o = await db.order.findUniqueOrThrow({ where: { id: g.pedidoId }, include: { lineas: true } });
    assert.equal(o.recogerEnId, ubicB);
    assert.deepEqual(o.lineas.map((l) => l.ubicacionId), [ubicB]);
    const r = await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false });
    assert.ok(r.ok);
    assert.match(r.texto, /\nRecoger en PRUEBA-CR B: PRUEBA-CR 4 calle 11-47\n/);
    assert.equal(await apartado(p.id, ubicB), 2);
    assert.equal(await apartado(p.id, ubicA), 0);

    // Con envío la tienda de recoger no se guarda.
    const e = await guardarBorrador(base({ entrega: "envio", recogerEnId: ubicB, cliente: { nombre: "PRUEBA-CR cliente", telefono: "", departamento: "Petén", municipio: "Flores" }, direccion: "Calle 1" }), agente);
    assert.ok(e.ok);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: e.pedidoId } })).recogerEnId, null);
  });

  test("rechaza una tienda para recoger que no existe o está desactivada", async () => {
    assert.equal((await previsualizar(base({ recogerEnId: "no-existe" }), agente)).ok, false);
    await db.location.update({ where: { id: ubicB }, data: { activa: false } });
    const r = await previsualizar(base({ recogerEnId: ubicB }), agente);
    await db.location.update({ where: { id: ubicB }, data: { activa: true } });
    assert.equal(r.ok, false);
  });

  test("sin canal o sin existencia: copiar y marcar como enviado, o frenar sin apartar", async () => {
    // Canal sin adaptador: «enviar» se rechaza antes de apartar; «copiado» aparta y deja constancia en la conversación.
    const p = await nuevoProducto(10, 10);
    const g = await guardarBorrador(base({ conversacionId: convTikTok, lineas: [{ productoId: p.id, cantidad: 2, ubicacionId: null }] }), agente);
    assert.ok(g.ok);
    assert.equal((await enviarAlCliente(g.pedidoId, agente, { modo: "enviar", sobrePedido: false })).ok, false);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).estado, "borrador");
    assert.equal(await apartado(p.id, ubicA), 0);

    const c = await enviarAlCliente(g.pedidoId, agente, { modo: "copiado", sobrePedido: false });
    assert.ok(c.ok && c.texto.startsWith(`Pedido ${g.codigo}`));
    assert.equal(await apartado(p.id, ubicA), 2);
    assert.equal(await db.message.count({ where: { pedidoId: g.pedidoId } }), 0); // no salió por el sistema
    const linea = await db.activityLog.findFirstOrThrow({ where: { entidad: "Conversation", entidadId: convTikTok, accion: "pedido" } });
    assert.match((linea.detalle as { texto: string }).texto, new RegExp(`${g.codigo}.*fuera del sistema`));

    // Sin existencia: el agente no puede; un admin lo aparta «sobre pedido»; un agente no puede pedir «sobre pedido».
    const q = await nuevoProducto(1, 0);
    const e = base({ lineas: [{ productoId: q.id, cantidad: 3, ubicacionId: null }] });
    const s = await guardarBorrador(e, agente);
    assert.ok(s.ok);
    assert.equal((await enviarAlCliente(s.pedidoId, agente, { modo: "enviar", sobrePedido: false })).ok, false);
    assert.equal((await enviarAlCliente(s.pedidoId, agente, { modo: "enviar", sobrePedido: true })).ok, false);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: s.pedidoId } })).estado, "borrador");
    assert.equal(await apartado(q.id, ubicA), 0);
    assert.equal((await enviarAlCliente(s.pedidoId, admin, { modo: "enviar", sobrePedido: true })).ok, true);
    assert.equal(await apartado(q.id, ubicA), 3);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: s.pedidoId } })).sobrePedido, true);
  });

  test("descartar un borrador lo cancela sin tocar las existencias", async () => {
    const p = await nuevoProducto(4, 4);
    const g = await guardarBorrador(base({ lineas: [{ productoId: p.id, cantidad: 1, ubicacionId: null }] }), agente);
    assert.ok(g.ok);
    assert.equal((await descartarBorrador(g.pedidoId, agente)).ok, true);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: g.pedidoId } })).estado, "cancelado");
    assert.equal(await apartado(p.id, ubicA), 0);
    assert.equal((await descartarBorrador(g.pedidoId, agente)).ok, false); // ya no se puede cancelar de nuevo
  });
});
