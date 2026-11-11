import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { generarReportes } from "@/lib/reportes";
import type { Rol } from "@/generated/prisma/client";

// Necesita la base de datos (npm run db). Usa un rango de febrero de 2025, sin datos de demostración, y borra lo que crea (prefijo PRUEBA-RA).
// El caso que lo motivó: un asesor habla con el cliente, pero la venta la cierra oficina u otro asesor; el reporte debe mostrar
// que ese asesor participó.

describe("reporte de asesores (con base de datos)", () => {
  const filtro = { desde: "2025-02-10", hasta: "2025-02-12", canal: "todos" as const };
  // Mediodía de Guatemala = 18:00 UTC.
  const en = (dia: number, hora = 18) => new Date(Date.UTC(2025, 1, dia, hora));
  let contactoId: string;
  let a: string, b: string, oficina: string;
  let n = 0;

  const usuario = async (nombre: string, rol: Rol) => (await db.user.create({ data: { nombre: `PRUEBA-RA ${nombre}`, correo: `prueba-ra-${nombre.toLowerCase()}@homeoutlet.test`, rol, passwordHash: "x" } })).id;
  const conversacion = async () => (await db.conversation.create({ data: { contactoId, canal: "whatsapp", creada: en(10, 15) } })).id;
  const escribe = (conversacionId: string, enviadoPorId: string, fecha: Date, extra: { pedidoId?: string } = {}) =>
    db.message.create({ data: { conversacionId, direccion: "saliente", autor: "asesor", texto: "hola", enviadoPorId, fecha, ...extra } });
  const venta = (conversacionId: string, creadoPorId: string, total: number, pagadoEl: Date) =>
    db.order.create({ data: { codigo: `PRUEBA-RA-${++n}`, contactoId, conversacionId, canal: "whatsapp", estado: "pagado", subtotal: total, total, creadoPorId, creada: en(10), eventos: { create: [{ aEstado: "pagado", fecha: pagadoEl }] } } });

  before(async () => {
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-RA contacto" } })).id;
    a = await usuario("Ana", "agente");
    b = await usuario("Beto", "agente");
    oficina = await usuario("Olga", "oficina");
  });
  after(async () => {
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.user.deleteMany({ where: { correo: { startsWith: "prueba-ra-" } } });
    await db.$disconnect();
  });

  test("cuenta los mensajes de cada asesor y las ventas en que participó, aunque las cerrara otra persona", async () => {
    // Conversación 1: Ana escribe 3 mensajes y Beto 1; oficina también escribe, y es quien crea el pedido (pagado el 12).
    const c1 = await conversacion();
    for (const h of [15, 16, 17]) await escribe(c1, a, en(10, h));
    await escribe(c1, b, en(11));
    await escribe(c1, oficina, en(12, 15));
    await escribe(c1, oficina, en(12, 16));
    const o1 = await venta(c1, oficina, 50_000, en(12));
    await escribe(c1, a, en(12, 19), { pedidoId: o1.id }); // el resumen del pedido no es un mensaje escrito
    await db.message.create({ data: { conversacionId: c1, direccion: "saliente", autor: "asistente", texto: "bot", fecha: en(10, 15) } });

    // Conversación 2: Ana escribe y crea su propio pedido. Otro mensaje suyo queda fuera del rango.
    const c2 = await conversacion();
    await escribe(c2, a, en(10, 20));
    await escribe(c2, a, en(20));
    await venta(c2, a, 20_000, en(11));

    // Conversación 3: Beto crea un pedido que se paga antes de que él escriba: es suyo, pero no «participó» antes del pago.
    const c3 = await conversacion();
    await venta(c3, b, 30_000, en(11, 15));
    await escribe(c3, b, en(11, 20));

    const r = await generarReportes(filtro, { asesores: true });
    const fila = (id: string) => r.asesores!.find((x) => x.id === id);
    assert.equal(fila(oficina), undefined, "oficina no aparece");
    assert.deepEqual(
      { ...fila(a), nombre: undefined, id: undefined },
      { nombre: undefined, id: undefined, activo: true, mensajes: 4, conversaciones: 2, participo: { ventas: 2, monto: 70_000, cerroOtro: 1 }, creados: { ventas: 1, monto: 20_000 } },
    );
    assert.deepEqual(
      { ...fila(b), nombre: undefined, id: undefined },
      { nombre: undefined, id: undefined, activo: true, mensajes: 2, conversaciones: 2, participo: { ventas: 1, monto: 50_000, cerroOtro: 1 }, creados: { ventas: 1, monto: 30_000 } },
    );
  });

  test("solo se calcula cuando se pide (el administrador)", async () => {
    assert.equal((await generarReportes(filtro)).asesores, undefined);
  });

  test("el filtro por canal también se aplica", async () => {
    const r = await generarReportes({ ...filtro, canal: "instagram" }, { asesores: true });
    const fila = r.asesores!.find((x) => x.id === a)!;
    assert.deepEqual([fila.mensajes, fila.participo.ventas, fila.creados.ventas], [0, 0, 0]);
  });
});
