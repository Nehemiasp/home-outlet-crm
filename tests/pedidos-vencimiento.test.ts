import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { POST } from "@/app/api/tareas/vencer-reservas/route";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { puedeCancelarPedido, puedeDescontar, puedeSobrePedido, puedeVerificarPagos } from "@/lib/permisos";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { cambiarEstado } from "@/lib/pedidos/flujo";
import { avanzarPedido, marcarEnviado } from "@/lib/pedidos/gestion";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { vencerReservas } from "@/lib/pedidos/vencimiento";
import type { Rol } from "@/lib/permisos";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-VN y se borra al final.

describe("permisos de pedidos", () => {
  const admin = { id: "a", rol: "admin" as const };
  const agente = { id: "g", rol: "agente" as const };

  test("descuento: el agente llega hasta su límite; sobre el límite y «sobre pedido» son del admin", () => {
    assert.equal(puedeDescontar(agente, 0, 10_000, 0), true);
    assert.equal(puedeDescontar(agente, 1, 10_000, 0), false);
    assert.equal(puedeDescontar(agente, 500, 10_000, 5), true);
    assert.equal(puedeDescontar(agente, 501, 10_000, 5), false);
    assert.equal(puedeDescontar(admin, 9_999, 10_000, 0), true);
    assert.equal(puedeSobrePedido(admin), true);
    assert.equal(puedeSobrePedido(agente), false);
  });

  test("verificar pagos: el admin siempre, el agente solo con el permiso", () => {
    assert.equal(puedeVerificarPagos(admin), true);
    assert.equal(puedeVerificarPagos(agente), false);
    assert.equal(puedeVerificarPagos({ ...agente, puedeVerificarPagos: false }), false);
    assert.equal(puedeVerificarPagos({ ...agente, puedeVerificarPagos: true }), true);
  });

  test("cancelar: el agente solo lo que creó y sin pago verificado; el admin siempre", () => {
    assert.equal(puedeCancelarPedido(agente, { creadoPorId: "g" }, false), true);
    assert.equal(puedeCancelarPedido(agente, { creadoPorId: "g" }, true), false);
    assert.equal(puedeCancelarPedido(agente, { creadoPorId: "otro" }, false), false);
    assert.equal(puedeCancelarPedido(agente, { creadoPorId: null }, false), false);
    assert.equal(puedeCancelarPedido(admin, { creadoPorId: "otro" }, true), true);
  });
});

describe("vencimiento de reservas y avisos de estado (con base de datos)", () => {
  let admin: { id: string; nombre: string; rol: "admin" };
  let agente: { id: string; nombre: string; rol: "agente" };
  let contactoId: string;
  let conv: string;
  let ubicA: string;
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  let n = 0;
  const HORA = 3_600_000;

  const pedido = async (reservadoHasta: Date, sobre: { entrega?: "recoger" | "envio" } = {}) => {
    const p = await db.product.create({ data: { sku: `PRUEBA-VN-${++n}`, nombre: `PRUEBA-VN ${n}`, precio: 10_000 } });
    await db.stock.create({ data: { productoId: p.id, ubicacionId: ubicA, cantidad: 10 } });
    const o = await db.order.create({
      data: { codigo: `PRUEBA-VN-${Date.now()}-${n}`, contactoId, conversacionId: conv, canal: "simulado", subtotal: 20_000, total: 20_000, entrega: sobre.entrega ?? "recoger", creadoPorId: agente.id, lineas: { create: { productoId: p.id, sku: p.sku, nombre: p.nombre, precio: 10_000, cantidad: 2, ubicacionId: ubicA } } },
    });
    assert.equal((await cambiarEstado({ pedidoId: o.id, a: "pendiente_pago", quien: { usuarioId: admin.id } })).ok, true);
    await db.order.update({ where: { id: o.id }, data: { reservadoHasta } });
    return { ...o, productoId: p.id };
  };
  const apartado = async (productoId: string) => (await db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId, ubicacionId: ubicA } } })).apartado;
  const estado = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).estado;
  const mensajes = (pedidoId: string) => db.message.findMany({ where: { pedidoId }, orderBy: { fecha: "asc" } });

  before(async () => {
    originales = await obtenerAjustesPedidos();
    const u = (nombre: string, rol: Rol) => db.user.create({ data: { nombre, correo: `prueba-vn-${rol}@homeoutlet.test`, passwordHash: "x", rol } });
    const [a, g] = await Promise.all([u("Admin VN", "admin"), u("Agente VN", "agente")]);
    admin = { id: a.id, nombre: a.nombre, rol: "admin" };
    agente = { id: g.id, nombre: g.nombre, rol: "agente" };
    ubicA = (await db.location.create({ data: { nombre: "PRUEBA-VN A" } })).id;
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: "separado", ubicacionRecogerId: ubicA, ubicacionEnvioId: ubicA, mensajes: Prisma.JsonNull } });
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-VN cliente" } })).id;
    await db.channelIdentity.create({ data: { contactoId, canal: "simulado", externalContactId: "prueba-vn-sim" } });
    conv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date(), atendidaPor: "asistente" } })).id;
  });
  after(async () => {
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, mensajes: (originales.mensajes as Prisma.InputJsonValue | null) ?? Prisma.JsonNull } });
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-VN-" } } });
    await db.location.deleteMany({ where: { nombre: { startsWith: "PRUEBA-VN" } } });
    const ids = [admin.id, agente.id];
    await db.activityLog.deleteMany({ where: { OR: [{ usuarioId: { in: ids } }, { entidad: "Order", accion: "aviso_por_vencer" }] } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  test("vence solo lo que ya pasó de su hora: libera lo apartado y avisa al cliente sin quitarle la conversación al asistente", async () => {
    const vencido = await pedido(new Date(Date.now() - HORA));
    const vigente = await pedido(new Date(Date.now() + HORA));
    assert.equal(await apartado(vencido.productoId), 2);

    assert.ok((await vencerReservas({ forzar: true })) >= 1);
    assert.equal(await estado(vencido.id), "vencido");
    assert.equal(await apartado(vencido.productoId), 0);
    assert.equal(await estado(vigente.id), "pendiente_pago");
    assert.equal(await apartado(vigente.productoId), 2);

    const aviso = (await mensajes(vencido.id)).at(-1);
    assert.match(aviso?.texto ?? "", new RegExp(`Su pedido ${vencido.codigo} venció`));
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conv } })).atendidaPor, "asistente");
    const evento = await db.orderEvent.findFirstOrThrow({ where: { pedidoId: vencido.id, aEstado: "vencido" } });
    assert.deepEqual([evento.origen, evento.usuarioId], ["sistema", null]);

    const antes = (await mensajes(vencido.id)).length;
    await vencerReservas({ forzar: true });
    assert.equal((await mensajes(vencido.id)).length, antes); // es idempotente: no vuelve a avisar
  });

  test("un pedido con un pago parcial verificado no vence solo", async () => {
    const o = await pedido(new Date(Date.now() - HORA));
    await db.payment.create({ data: { pedidoId: o.id, tipo: "transferencia", banco: "B", referencia: "R", monto: 5_000, fechaPago: new Date(), estado: "verificado" } });
    await vencerReservas({ forzar: true });
    assert.equal(await estado(o.id), "pendiente_pago");
    assert.equal(await apartado(o.productoId), 2);
  });

  test("el aviso apagado en Ajustes no se manda, pero el pedido igual vence", async () => {
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: { vencido: { activo: false, texto: "x" } } } });
    const o = await pedido(new Date(Date.now() - HORA));
    await vencerReservas({ forzar: true });
    assert.equal(await estado(o.id), "vencido");
    assert.equal((await mensajes(o.id)).length, 0);
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: Prisma.JsonNull } });
  });

  test("el recordatorio 2 horas antes viene apagado; encendido se manda una sola vez", async () => {
    const o = await pedido(new Date(Date.now() + HORA));
    await vencerReservas({ forzar: true });
    assert.equal((await mensajes(o.id)).length, 0);

    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: { por_vencer: { activo: true, texto: "Su pedido {codigo} vence pronto. Total: {total}" } } } });
    await vencerReservas({ forzar: true });
    await vencerReservas({ forzar: true });
    const m = await mensajes(o.id);
    assert.equal(m.length, 1);
    assert.equal(m[0]!.texto, `Su pedido ${o.codigo} vence pronto. Total: Q200.00`);
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: Prisma.JsonNull } });
  });

  test("reactivar un pedido vencido lo vuelve a apartar, con tiempo nuevo", async () => {
    const o = await pedido(new Date(Date.now() - HORA));
    await vencerReservas({ forzar: true });
    assert.equal(await apartado(o.productoId), 0);
    assert.equal((await avanzarPedido(o.id, "pendiente_pago", admin)).ok, true);
    assert.equal(await apartado(o.productoId), 2);
    assert.ok((await db.order.findUniqueOrThrow({ where: { id: o.id } })).reservadoHasta!.getTime() > Date.now() + 23 * HORA);
  });

  test("avisos de «listo para recoger» y «enviado» (con paquetería, guía y el archivo de la guía) salen por el canal", async () => {
    const recoger = await pedido(new Date(Date.now() + HORA));
    await db.order.update({ where: { id: recoger.id }, data: { estado: "preparando" } });
    const r = await avanzarPedido(recoger.id, "listo_para_recoger", agente);
    assert.ok(r.ok && r.aviso?.estado === "enviado");
    assert.match((await mensajes(recoger.id)).at(-1)!.texto!, /¡Su pedido .* está listo para recoger![\s\S]*Lo esperamos en: [\s\S]*Horario: /);

    const envio = await pedido(new Date(Date.now() + HORA), { entrega: "envio" });
    await db.order.update({ where: { id: envio.id }, data: { estado: "preparando" } });
    assert.equal((await avanzarPedido(envio.id, "listo_para_recoger", agente)).ok, false); // un envío no se «recoge»
    const directo = await avanzarPedido(envio.id, "enviado", agente);
    assert.ok(!directo.ok && /cómo sale/i.test(directo.error)); // «enviado» solo entra por marcarEnviado, que valida la guía
    const png = new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)])], "guía forza.png", { type: "image/png" });
    const sinGuia = await marcarEnviado(envio.id, agente, { paqueteria: "Forza", guia: "   ", archivo: png });
    assert.ok(!sinGuia.ok && /número de guía/i.test(sinGuia.error));
    const sinArchivo = await marcarEnviado(envio.id, agente, { paqueteria: "Forza", guia: "GT123456", archivo: null });
    assert.ok(!sinArchivo.ok && /Adjunte la guía/.test(sinArchivo.error));
    assert.equal(await estado(envio.id), "preparando");
    const e = await marcarEnviado(envio.id, agente, { paqueteria: "Forza", guia: "GT123456", archivo: png });
    assert.ok(e.ok && e.guia?.estado === "enviada", JSON.stringify(e));
    const o = await db.order.findUniqueOrThrow({ where: { id: envio.id } });
    assert.deepEqual([o.guia, o.paqueteria, o.guiaArchivoNombre], ["GT123456", "Forza", "guía forza.png"]);
    const [aviso, archivo] = (await mensajes(envio.id)).slice(-2); // primero el aviso, después la guía
    assert.match(aviso!.texto!, new RegExp(`¡Su pedido ${envio.codigo} va en camino!`));
    assert.match(aviso!.texto!, /Paquetería: Forza\nNúmero de guía: GT123456/);
    assert.deepEqual([archivo!.tipo, archivo!.archivoUrl], ["image", o.guiaArchivoUrl]);
    const evento = await db.orderEvent.findFirstOrThrow({ where: { pedidoId: envio.id, aEstado: "enviado" } });
    assert.deepEqual([evento.usuarioId, evento.nota], [agente.id, "Por Forza · guía GT123456 · guía adjunta: guía forza.png"]);
    await unlink(path.join(process.cwd(), "uploads", o.guiaArchivoUrl!.replace("/api/archivos/", ""))).catch(() => {});
  });

  test("cancelar: un agente solo lo que creó; no puede pedir pasos de pago a mano; el admin cancela y libera", async () => {
    const o = await pedido(new Date(Date.now() + HORA));
    const otroAgente = { ...agente, id: admin.id, rol: "agente" as const }; // otra persona que no creó el pedido
    assert.equal((await avanzarPedido(o.id, "cancelado", otroAgente)).ok, false);
    assert.equal((await avanzarPedido(o.id, "pagado", admin)).ok, false); // «pagado» sale de verificar comprobantes
    assert.equal((await avanzarPedido(o.id, "en_revision", admin)).ok, false);
    assert.equal(await estado(o.id), "pendiente_pago");
    assert.equal((await avanzarPedido(o.id, "cancelado", agente)).ok, true); // el agente que lo creó
    assert.equal(await apartado(o.productoId), 0);
  });

  test("la ruta del cron: sin secreto no existe, y con él pide el encabezado correcto", async () => {
    const previo = process.env.TAREAS_SECRET;
    const llamar = (auth?: string) => POST(new Request("http://localhost/api/tareas/vencer-reservas", { method: "POST", headers: auth ? { authorization: auth } : {} }));
    delete process.env.TAREAS_SECRET;
    assert.equal((await llamar("Bearer x")).status, 404);
    process.env.TAREAS_SECRET = "secreto-de-prueba";
    assert.equal((await llamar()).status, 401);
    assert.equal((await llamar("Bearer otro-secreto")).status, 401);
    const ok = await llamar("Bearer secreto-de-prueba");
    assert.equal(ok.status, 200);
    assert.equal(typeof (await ok.json()).vencidos, "number");
    if (previo === undefined) delete process.env.TAREAS_SECRET;
    else process.env.TAREAS_SECRET = previo;
  });
});
