import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { cambiarEstadoAsesor } from "@/lib/equipo/estado";
import { cambiarEstadoPorAdmin, devolverACola, panelEquipo, repartirConversaciones } from "@/lib/equipo/gestion";
import { AUSENCIA_LARGA_MS } from "@/lib/equipo/tipos";
import { aislar, conversacionEsperando, crearUsuario, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Datos con el prefijo PRUEBA-EQ; los asesores de demostración quedan Desconectados mientras corre.

describe("devolver, repartir y panel del equipo (con base de datos)", () => {
  let a: { id: string; nombre: string }, b: { id: string; nombre: string }, c: { id: string; nombre: string }, admin: { id: string; nombre: string };
  const actor = (u: { id: string; nombre: string }, rol: "admin" | "agente" = "agente") => ({ ...u, rol });
  const conv = (id: string) => db.conversation.findUniqueOrThrow({ where: { id } });
  const textos = async (id: string) => (await db.activityLog.findMany({ where: { entidadId: id, accion: "asignar" }, orderBy: { fecha: "asc" } })).map((l) => l.detalle as { tipo: string; a?: string; por?: string; motivo?: string });
  const horasAtras = (min: number) => new Date(Date.now() - min * 60_000);

  before(async () => {
    await aislar();
    [a, b, c, admin] = await Promise.all([crearUsuario("ga"), crearUsuario("gb"), crearUsuario("gc", "agente", "desconectado"), crearUsuario("gadmin", "admin")]);
  });
  after(async () => {
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("devolver a la cola: deja de ser suya, se reparte a otro y nunca vuelve a caer en quien la devolvió", async () => {
    const { conversacion } = await conversacionEsperando({ asignadaAId: a.id });
    const r = await devolverACola(conversacion.id, actor(a), "Es de otra sucursal");
    assert.deepEqual(r, { ok: true, asignadaA: b.nombre });
    assert.equal((await conv(conversacion.id)).asignadaAId, b.id);
    const tipos = (await textos(conversacion.id)).map((t) => t.tipo);
    assert.deepEqual(tipos, ["devolver", "cola"]);
    assert.equal((await textos(conversacion.id))[0]!.motivo, "Es de otra sucursal");
  });

  test("si no hay nadie más disponible, la conversación queda esperando en «Sin asignar» y no vuelve a quien la devolvió", async () => {
    await cambiarEstadoAsesor(b.id, { estado: "en_pausa", origen: "manual" });
    const { conversacion } = await conversacionEsperando({ asignadaAId: a.id });
    const r = await devolverACola(conversacion.id, actor(a));
    assert.deepEqual(r, { ok: true, asignadaA: null });
    const v = await conv(conversacion.id);
    assert.equal(v.asignadaAId, null);
    assert.ok(v.esperandoAsesorDesde);
    assert.equal(v.excluirAsesorId, a.id);
    // Cuando b vuelve, se la queda b; a sigue excluido aunque esté disponible.
    await cambiarEstadoAsesor(b.id, { estado: "disponible", origen: "manual" });
    assert.equal((await conv(conversacion.id)).asignadaAId, b.id);
  });

  test("solo quien la tiene asignada puede devolverla, y solo un asesor, y solo si está abierta", async () => {
    const ajena = await conversacionEsperando({ asignadaAId: b.id });
    assert.equal((await devolverACola(ajena.conversacion.id, actor(a))).ok, false);
    assert.equal((await conv(ajena.conversacion.id)).asignadaAId, b.id);
    assert.equal((await devolverACola(ajena.conversacion.id, actor(admin, "admin"))).ok, false);
    const cerrada = await conversacionEsperando({ asignadaAId: a.id, estado: "cerrada" });
    assert.equal((await devolverACola(cerrada.conversacion.id, actor(a))).ok, false);
  });

  test("el administrador cambia el estado de un asesor y queda registrado quién lo hizo", async () => {
    assert.deepEqual(await cambiarEstadoPorAdmin(c.id, "en_pausa", admin), { ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(u.estadoAsesor, "en_pausa");
    assert.equal(u.motivoPausa, "Pausado por un administrador");
    const h = await db.historialEstadoAsesor.findFirstOrThrow({ where: { usuarioId: c.id, fin: null } });
    assert.deepEqual({ origen: h.origen, por: h.cambiadoPorId }, { origen: "admin", por: admin.id });
    assert.equal((await cambiarEstadoPorAdmin(admin.id, "disponible", admin)).ok, false, "un administrador no tiene estado");
  });

  test("el panel marca quién se puede repartir: más de 30 minutos en pausa o desconectado, con conversaciones abiertas", async () => {
    await db.conversation.updateMany({ where: { contacto: { nombre: { startsWith: "PRUEBA-EQ" } } }, data: { estado: "cerrada" } });
    await conversacionEsperando({ asignadaAId: c.id });
    await db.user.update({ where: { id: c.id }, data: { estadoDesde: horasAtras(10) } });
    const fila = async () => (await panelEquipo()).find((f) => f.id === c.id)!;
    assert.equal((await fila()).puedeRepartir, false, "solo 10 minutos");
    await db.user.update({ where: { id: c.id }, data: { estadoDesde: new Date(Date.now() - AUSENCIA_LARGA_MS - 60_000) } });
    const lista = await panelEquipo();
    assert.deepEqual({ ...lista.find((f) => f.id === c.id)!, desde: "" }, { id: c.id, nombre: c.nombre, estado: "en_pausa", desde: "", motivo: "Pausado por un administrador", abiertas: 1, puedeRepartir: true });
    assert.equal(lista.find((f) => f.id === a.id)!.puedeRepartir, false, "a está disponible");
  });

  test("repartir las conversaciones de quien lleva rato ausente las pasa a los disponibles, sin volver a caer en él", async () => {
    const x = await conversacionEsperando({ asignadaAId: c.id });
    const r = await repartirConversaciones(c.id, admin);
    assert.deepEqual(r, { ok: true, repartidas: 2, sinAsesor: 0 });
    const v = await conv(x.conversacion.id);
    assert.ok(v.asignadaAId === a.id || v.asignadaAId === b.id);
    const t = (await textos(x.conversacion.id)).at(-1)!;
    assert.deepEqual({ tipo: t.tipo, por: t.por }, { tipo: "reparto", por: admin.nombre });
    assert.equal(await db.conversation.count({ where: { asignadaAId: c.id, estado: { not: "cerrada" } } }), 0);
  });

  test("no se reparte si la persona está disponible, no tiene conversaciones o lleva poco tiempo ausente", async () => {
    assert.equal((await repartirConversaciones(a.id, admin)).ok, false);
    assert.equal((await repartirConversaciones(c.id, admin)).ok, false, "ya no tiene conversaciones abiertas");
    await conversacionEsperando({ asignadaAId: c.id });
    await db.user.update({ where: { id: c.id }, data: { estadoDesde: horasAtras(5) } });
    assert.equal((await repartirConversaciones(c.id, admin)).ok, false, "solo 5 minutos");
  });

  test("las que no encuentran a nadie disponible quedan en «Sin asignar» y se avisa", async () => {
    await db.conversation.updateMany({ where: { asignadaAId: c.id }, data: { estado: "cerrada" } });
    const y = await conversacionEsperando({ asignadaAId: c.id });
    await db.user.update({ where: { id: c.id }, data: { estadoDesde: new Date(Date.now() - AUSENCIA_LARGA_MS - 60_000) } });
    await cambiarEstadoAsesor(a.id, { estado: "desconectado", origen: "manual" });
    await cambiarEstadoAsesor(b.id, { estado: "desconectado", origen: "manual" });
    const r = await repartirConversaciones(c.id, admin);
    assert.deepEqual(r, { ok: true, repartidas: 0, sinAsesor: 1 });
    assert.equal((await conv(y.conversacion.id)).asignadaAId, null);
    assert.equal((await textos(y.conversacion.id)).at(-1)!.tipo, "sin_asesor");
  });
});
