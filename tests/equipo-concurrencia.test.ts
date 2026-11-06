import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { procesarMensajeEntrante } from "@/lib/ia/atencion";
import { recibirMensaje } from "@/lib/mensajeria";
import { aislar, crearUsuario, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Mensajes que llegan al mismo tiempo no deben repartirse mal ni asignarse dos veces.

describe("asignación con mensajes simultáneos (con base de datos)", () => {
  let asesores: string[];
  let encendidoPrevio = true;
  let n = 0;
  const entrante = (telefono: string, nombre: string, texto = "Hola, quiero comprar") =>
    recibirMensaje({ channel: "simulado", externalContactId: telefono, contactName: nombre, externalMessageId: `eq-${Date.now()}-${++n}-${Math.random()}`, type: "text", text: texto, timestamp: new Date() });

  before(async () => {
    await aislar();
    // Con el asistente apagado, todo mensaje nuevo va directo a un asesor.
    encendidoPrevio = (await db.aiSettings.findUniqueOrThrow({ where: { id: "ia" } })).encendido;
    await db.aiSettings.update({ where: { id: "ia" }, data: { encendido: false } });
    asesores = (await Promise.all([crearUsuario("ca"), crearUsuario("cb"), crearUsuario("cc")])).map((u) => u.id);
  });
  after(async () => {
    await db.aiSettings.update({ where: { id: "ia" }, data: { encendido: encendidoPrevio } });
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("dos mensajes seguidos del mismo cliente generan una sola asignación", async () => {
    const m1 = await entrante("+50250990101", "PRUEBA-EQ cliente doble", "Hola");
    const id = m1.conversacionId!;
    // El segundo mensaje llega mientras el primero todavía se está procesando.
    await Promise.all([procesarMensajeEntrante(id), entrante("+50250990101", "PRUEBA-EQ cliente doble", "¿Me atienden?").then((m2) => procesarMensajeEntrante(m2.conversacionId!)), procesarMensajeEntrante(id)]);
    const c = await db.conversation.findUniqueOrThrow({ where: { id } });
    assert.ok(c.asignadaAId && asesores.includes(c.asignadaAId));
    assert.equal(await db.activityLog.count({ where: { entidadId: id, accion: "asignar" } }), 1);
  });

  test("seis clientes que escriben a la vez se reparten parejo entre tres asesores disponibles", async () => {
    await db.conversation.updateMany({ where: { asignadaAId: { in: asesores } }, data: { estado: "cerrada" } }); // todos parten con 0 abiertas
    const recibidos = await Promise.all(Array.from({ length: 6 }, (_, i) => entrante(`+5025099020${i}`, `PRUEBA-EQ cliente ${i}`)));
    await Promise.all(recibidos.map((r) => procesarMensajeEntrante(r.conversacionId!)));
    const cargas = await Promise.all(asesores.map((id) => db.conversation.count({ where: { asignadaAId: id, estado: { not: "cerrada" } } })));
    assert.deepEqual(cargas, [2, 2, 2]);
    for (const r of recibidos) assert.equal(await db.activityLog.count({ where: { entidadId: r.conversacionId!, accion: "asignar" } }), 1, "ninguna se asignó dos veces");
  });

  test("si nadie está disponible, quedan esperando y se reparten al volver el primero", async () => {
    await db.user.updateMany({ where: { id: { in: asesores } }, data: { estadoAsesor: "desconectado" } });
    const r = await entrante("+50250990300", "PRUEBA-EQ cliente sin nadie");
    await procesarMensajeEntrante(r.conversacionId!);
    const antes = await db.conversation.findUniqueOrThrow({ where: { id: r.conversacionId! } });
    assert.equal(antes.asignadaAId, null);
    assert.ok(antes.esperandoAsesorDesde);
    const { activar } = await import("@/lib/equipo/estado");
    await activar(asesores[0]!);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: r.conversacionId! } })).asignadaAId, asesores[0]);
  });
});
