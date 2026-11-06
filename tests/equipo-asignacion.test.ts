import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { asignarConversacion, elegirAsesor, procesarCola, type Candidato } from "@/lib/equipo/asignacion";
import { activar, cambiarEstadoAsesor } from "@/lib/equipo/estado";
import { cambiarEstado } from "@/lib/pedidos/flujo";
import { enviarMensaje } from "@/lib/mensajeria";
import { aislar, conversacionEsperando, crearUsuario, fijarAjustes, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Crea datos con el prefijo PRUEBA-EQ y los borra al terminar.
// Mientras corre, los asesores de demostración quedan Desconectados (y se restauran al final).

const c = (id: string, abiertas: number, ultima: number | null = null): Candidato => ({ id, nombre: id, abiertas, ultimaAsignacionEn: ultima === null ? null : new Date(ultima) });

describe("regla de reparto (sin base de datos)", () => {
  test("4a: el asesor responsable disponible va primero, aunque tenga más carga", () => {
    const r = elegirAsesor([c("a", 5), c("b", 0)], { responsableId: "a" });
    assert.deepEqual({ id: r!.asesor.id, regla: r!.regla }, { id: "a", regla: "responsable" });
  });
  test("4b: sin responsable disponible, el de menos conversaciones abiertas", () => {
    const r = elegirAsesor([c("a", 3), c("b", 1), c("c", 2)]);
    assert.deepEqual({ id: r!.asesor.id, regla: r!.regla }, { id: "b", regla: "menos_carga" });
  });
  test("4c: si el responsable no está entre los disponibles, se reparte por carga", () => {
    const r = elegirAsesor([c("b", 2), c("c", 1)], { responsableId: "a" });
    assert.equal(r!.asesor.id, "c");
    assert.equal(r!.regla, "menos_carga");
  });
  test("en empate gana quien lleva más tiempo sin recibir una; quien nunca recibió, primero", () => {
    assert.equal(elegirAsesor([c("a", 1, 2_000), c("b", 1, 1_000)])!.asesor.id, "b");
    assert.equal(elegirAsesor([c("a", 1, 2_000), c("b", 1, null)])!.asesor.id, "b");
  });
  test("quien devolvió la conversación queda excluido, incluso si es el responsable", () => {
    assert.equal(elegirAsesor([c("a", 0), c("b", 4)], { responsableId: "a", excluirId: "a" })!.asesor.id, "b");
    assert.equal(elegirAsesor([c("a", 0)], { excluirId: "a" }), null);
  });
  test("sin candidatos no hay asignación", () => assert.equal(elegirAsesor([]), null));
});

describe("asignación de conversaciones (con base de datos)", () => {
  let a: string, b: string, cc: string;
  const dueno = async (id: string) => (await db.conversation.findUniqueOrThrow({ where: { id }, select: { asignadaAId: true, atendidaPor: true, esperandoAsesorDesde: true } }));

  before(async () => {
    await aislar();
    a = (await crearUsuario("a")).id;
    b = (await crearUsuario("b")).id;
    cc = (await crearUsuario("c", "agente", "desconectado")).id;
  });
  after(async () => {
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("4b: se asigna al disponible con menos conversaciones abiertas y la conversación deja de esperar", async () => {
    await conversacionEsperando({ asignadaAId: a });
    await conversacionEsperando({ asignadaAId: a });
    await conversacionEsperando({ asignadaAId: b });
    const { conversacion } = await conversacionEsperando();
    const r = await asignarConversacion(conversacion.id);
    assert.ok(r.ok);
    assert.equal(r.ok && r.asignada.asesorId, b);
    assert.deepEqual(await dueno(conversacion.id), { asignadaAId: b, atendidaPor: "asesor", esperandoAsesorDesde: null });
    const log = await db.activityLog.findFirstOrThrow({ where: { entidadId: conversacion.id, accion: "asignar" } });
    assert.equal((log.detalle as { tipo: string }).tipo, "automatica");
  });

  test("4a: el asesor responsable disponible recibe la conversación aunque otro tenga menos carga", async () => {
    const { conversacion } = await conversacionEsperando({ asesorResponsableId: a });
    const r = await asignarConversacion(conversacion.id);
    assert.equal(r.ok && r.asignada.asesorId, a);
    assert.equal(r.ok && r.asignada.regla, "responsable");
  });

  test("4c: si el responsable está En pausa o Desconectado, se asigna por carga y el responsable no cambia", async () => {
    await cambiarEstadoAsesor(a, { estado: "en_pausa", origen: "manual" });
    const { contacto, conversacion } = await conversacionEsperando({ asesorResponsableId: a });
    const r = await asignarConversacion(conversacion.id);
    assert.equal(r.ok && r.asignada.asesorId, b, "solo b está disponible");
    assert.equal((await db.contact.findUniqueOrThrow({ where: { id: contacto.id } })).asesorResponsableId, a);
    await activar(a);
  });

  test("nunca se asigna a un asesor En pausa o Desconectado", async () => {
    await cambiarEstadoAsesor(a, { estado: "en_pausa", origen: "manual" });
    await cambiarEstadoAsesor(b, { estado: "desconectado", origen: "manual" });
    const { conversacion } = await conversacionEsperando();
    const r = await asignarConversacion(conversacion.id);
    assert.deepEqual(r, { ok: false, motivo: "sin_candidato" });
    assert.equal((await dueno(conversacion.id)).asignadaAId, null);
  });

  test("4d: las pendientes se reparten de la más antigua a la más nueva cuando alguien pasa a Disponible", async () => {
    await db.conversation.updateMany({ where: { contacto: { nombre: { startsWith: "PRUEBA-EQ" } }, asignadaAId: null }, data: { estado: "cerrada" } });
    const hace = (min: number) => new Date(Date.now() - min * 60_000);
    const nueva = await conversacionEsperando({ esperaDesde: hace(1) });
    const vieja = await conversacionEsperando({ esperaDesde: hace(30) });
    const media = await conversacionEsperando({ esperaDesde: hace(10) });
    await db.user.updateMany({ where: { id: { in: [a, b] } }, data: { ultimaAsignacionEn: null } });
    assert.equal(await procesarCola(), 0, "sin disponibles no se asigna nada");

    // a y b vuelven: a primero (el reparto corre al pasar a Disponible, así que se hace en una sola pasada al final)
    await db.user.updateMany({ where: { id: { in: [a, b] } }, data: { estadoAsesor: "disponible" } });
    // Cargas iguales: la más antigua va a quien nunca recibió (empate por nombre: a), la siguiente a b, la última a a.
    await db.conversation.updateMany({ where: { asignadaAId: { in: [a, b] } }, data: { estado: "cerrada" } });
    assert.equal(await procesarCola(), 3);
    assert.equal((await dueno(vieja.conversacion.id)).asignadaAId, a);
    assert.equal((await dueno(media.conversacion.id)).asignadaAId, b);
    assert.equal((await dueno(nueva.conversacion.id)).asignadaAId, a);
  });

  test("pasar a Disponible dispara el reparto de lo que esperaba", async () => {
    await db.conversation.updateMany({ where: { contacto: { nombre: { startsWith: "PRUEBA-EQ" } } }, data: { estado: "cerrada" } });
    await cambiarEstadoAsesor(a, { estado: "desconectado", origen: "manual" });
    await cambiarEstadoAsesor(b, { estado: "desconectado", origen: "manual" });
    const { conversacion } = await conversacionEsperando();
    assert.equal((await dueno(conversacion.id)).asignadaAId, null);
    await cambiarEstadoAsesor(b, { estado: "disponible", origen: "manual" });
    assert.equal((await dueno(conversacion.id)).asignadaAId, b);
  });

  test("las conversaciones cerradas o que atiende el asistente no se asignan", async () => {
    const cerrada = await conversacionEsperando({ estado: "cerrada" });
    const delAsistente = await conversacionEsperando({ atendidaPor: "asistente" });
    assert.deepEqual(await asignarConversacion(cerrada.conversacion.id), { ok: false, motivo: "no_aplica" });
    assert.deepEqual(await asignarConversacion(delAsistente.conversacion.id), { ok: false, motivo: "no_aplica" });
    assert.equal((await dueno(delAsistente.conversacion.id)).asignadaAId, null);
  });

  test("quien devolvió la conversación a la cola no la recibe de nuevo", async () => {
    await cambiarEstadoAsesor(a, { estado: "disponible", origen: "manual" });
    const { conversacion } = await conversacionEsperando();
    await db.conversation.update({ where: { id: conversacion.id }, data: { excluirAsesorId: b } });
    const r = await asignarConversacion(conversacion.id);
    assert.equal(r.ok && r.asignada.asesorId, a);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } })).excluirAsesorId, null, "la exclusión se limpia al asignar");
  });

  test("con modo Manual nada se asigna solo", async () => {
    await fijarAjustes({ modoAsignacion: "manual" });
    const { conversacion } = await conversacionEsperando();
    assert.deepEqual(await asignarConversacion(conversacion.id), { ok: false, motivo: "no_aplica" });
    assert.equal(await procesarCola(), 0);
    assert.equal((await dueno(conversacion.id)).asignadaAId, null);
    await fijarAjustes({ modoAsignacion: "automatica" });
  });

  test("el primer asesor que responde queda como responsable; otro que responde después no lo cambia", async () => {
    const { contacto, conversacion } = await conversacionEsperando({ asignadaAId: a });
    assert.ok((await enviarMensaje({ conversacionId: conversacion.id, usuarioId: a, mensaje: { type: "text", text: "Hola" } })).ok);
    assert.equal((await db.contact.findUniqueOrThrow({ where: { id: contacto.id } })).asesorResponsableId, a);
    assert.ok((await enviarMensaje({ conversacionId: conversacion.id, usuarioId: b, mensaje: { type: "text", text: "Hola de nuevo" } })).ok);
    assert.equal((await db.contact.findUniqueOrThrow({ where: { id: contacto.id } })).asesorResponsableId, a);
  });

  test("una venta (pedido pagado) pasa la responsabilidad al asesor que la cerró", async () => {
    const { contacto, conversacion } = await conversacionEsperando({ asignadaAId: a });
    await db.contact.update({ where: { id: contacto.id }, data: { asesorResponsableId: a } });
    const pedido = await db.order.create({ data: { codigo: `PRUEBA-EQ-${Date.now()}`, contactoId: contacto.id, conversacionId: conversacion.id, canal: "simulado", estado: "pendiente_pago", creadoPorId: b } });
    const r = await cambiarEstado({ pedidoId: pedido.id, a: "pagado", quien: "sistema" });
    assert.ok(r.ok);
    assert.equal((await db.contact.findUniqueOrThrow({ where: { id: contacto.id } })).asesorResponsableId, b);
  });

  test("dos asignaciones a la vez de la misma conversación: solo una se hace y queda un solo registro", async () => {
    await db.conversation.updateMany({ where: { contacto: { nombre: { startsWith: "PRUEBA-EQ" } }, asignadaAId: null }, data: { estado: "cerrada" } });
    await cambiarEstadoAsesor(a, { estado: "disponible", origen: "manual" });
    await cambiarEstadoAsesor(b, { estado: "disponible", origen: "manual" });
    const { conversacion } = await conversacionEsperando();
    const rs = await Promise.all([asignarConversacion(conversacion.id), asignarConversacion(conversacion.id), asignarConversacion(conversacion.id)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await db.activityLog.count({ where: { entidadId: conversacion.id, accion: "asignar" } }), 1);
  });

  test("dos conversaciones a la vez con dos asesores libres: una para cada uno, no las dos para el mismo", async () => {
    await db.conversation.updateMany({ where: { OR: [{ asignadaAId: { in: [a, b] } }, { contacto: { nombre: { startsWith: "PRUEBA-EQ" } } }] }, data: { estado: "cerrada" } });
    const x = await conversacionEsperando({ atendidaPor: "asesor" });
    const y = await conversacionEsperando({ atendidaPor: "asesor" });
    const rs = await Promise.all([asignarConversacion(x.conversacion.id), asignarConversacion(y.conversacion.id)]);
    const ids = rs.map((r) => (r.ok ? r.asignada.asesorId : null));
    assert.ok(ids.every(Boolean));
    assert.notEqual(ids[0], ids[1]);
  });

  test("cc sigue Desconectado: nunca recibió nada", async () => {
    assert.equal(await db.conversation.count({ where: { asignadaAId: cc } }), 0);
  });
});
