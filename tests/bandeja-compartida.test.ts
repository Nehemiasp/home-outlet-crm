import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cargarConversacion, listarConversaciones } from "@/lib/bandeja";
import type { Filtros } from "@/lib/bandeja-tipos";
import { db } from "@/lib/db";
import { asignarConversacion, procesarCola } from "@/lib/equipo/asignacion";
import { participantesAlAsignar } from "@/lib/equipo/compartida";
import { devolverACola } from "@/lib/equipo/gestion";
import { enviarMensaje } from "@/lib/mensajeria";
import { puedeCerrar } from "@/lib/permisos";
import { juntarNombres } from "@/lib/utils";
import { restringido } from "@/lib/visibilidad";
import { aislar, conversacionEsperando, crearUsuario, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-EQ y se borra al final.

const filtros = (sobre: Partial<Filtros> = {}): Filtros => ({ tab: "todas", atencion: "todas", estado: "todos", canal: "todos", asesor: "todos", q: "", limite: 500, ...sobre });

describe("bandeja compartida (con base de datos)", () => {
  let ana: { id: string; nombre: string; rol: "agente" };
  let carlos: { id: string; nombre: string; rol: "agente" };
  let luis: { id: string; nombre: string; rol: "agente" };
  const canalesAntes = process.env.CHANNELS_ENABLED;
  const escribe = (conversacionId: string, u: { id: string }, texto: string, aviso = false) => enviarMensaje({ conversacionId, usuarioId: u.id, aviso, mensaje: { type: "text", text: texto } });
  const participantes = async (conversacionId: string) => (await db.participanteConversacion.findMany({ where: { conversacionId }, orderBy: { desde: "asc" }, select: { usuarioId: true } })).map((p) => p.usuarioId);
  const lineas = async (conversacionId: string) => (await db.activityLog.findMany({ where: { entidadId: conversacionId, accion: "asignar" }, orderBy: { fecha: "asc" } })).map((l) => (l.detalle as { tipo?: string }).tipo);

  before(async () => {
    process.env.CHANNELS_ENABLED = "simulado";
    await aislar({ modoAsignacion: "compartida", asesoresVenSoloSuyas: true }); // aunque el interruptor diga «solo las suyas», en la compartida ven todo
    const a = await crearUsuario("ana");
    const c = await crearUsuario("carlos");
    const l = await crearUsuario("luis");
    ana = { id: a.id, nombre: a.nombre, rol: "agente" };
    carlos = { id: c.id, nombre: c.nombre, rol: "agente" };
    luis = { id: l.id, nombre: l.nombre, rol: "agente" };
  });

  after(async () => {
    canalesAntes === undefined ? delete process.env.CHANNELS_ENABLED : (process.env.CHANNELS_ENABLED = canalesAntes);
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("nada se reparte solo y todos ven todas las conversaciones", async () => {
    const { conversacion } = await conversacionEsperando();
    assert.deepEqual(await asignarConversacion(conversacion.id), { ok: false, motivo: "no_aplica" });
    assert.equal(await procesarCola(), 0);
    assert.equal(await restringido(ana), false);
    const sinAsignar = await listarConversaciones(filtros({ tab: "sin-asignar" }), ana);
    assert.ok(sinAsignar.items.some((i) => i.id === conversacion.id)); // a la vista de todos mientras nadie le escribe
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } })).asignadaAId, null);
  });

  test("quien le escribe al cliente queda asignado; si otra persona escribe, se suma y se ven los dos", async () => {
    const { conversacion } = await conversacionEsperando();
    assert.ok((await escribe(conversacion.id, ana, "Hola, le atiende Ana")).ok);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } })).asignadaAId, ana.id);
    assert.ok((await escribe(conversacion.id, carlos, "Le paso el precio")).ok);
    assert.ok((await escribe(conversacion.id, ana, "¿Algo más?")).ok); // volver a escribir no repite nada
    const c = await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } });
    assert.equal(c.asignadaAId, ana.id); // la principal sigue siendo quien escribió primero
    assert.deepEqual(await participantes(conversacion.id), [ana.id, carlos.id]);
    assert.deepEqual(await lineas(conversacion.id), ["respuesta", "se_suma"]);

    const vista = await cargarConversacion(conversacion.id, luis); // Luis no participa y la ve igual
    assert.deepEqual(vista?.asignados.map((a) => a.id), [ana.id, carlos.id]);
    assert.equal(juntarNombres(vista!.asignados.map((a) => a.nombre)), `${ana.nombre} y ${carlos.nombre}`);
    assert.ok(vista?.linea.some((l) => l.clase === "sistema" && /se sumó a la conversación/.test(l.texto)));

    const item = (await listarConversaciones(filtros(), luis)).items.find((i) => i.id === conversacion.id);
    assert.deepEqual([item?.asesor, item?.asignados], [ana.nombre, 2]);
    const deCarlos = await listarConversaciones(filtros({ tab: "mias" }), carlos);
    assert.ok(deCarlos.items.some((i) => i.id === conversacion.id)); // «Mías» incluye en las que participa
    assert.ok(deCarlos.contadores.mias >= 1);
    const buscando = await listarConversaciones(filtros({ tab: "mias", q: "PRUEBA-EQ" }), luis); // la búsqueda no borra el filtro de «Mías»
    assert.equal(buscando.items.some((i) => i.id === conversacion.id), false);

    assert.equal(puedeCerrar(carlos, { asignadaAId: ana.id, participantes: [ana.id, carlos.id] }), true);
    assert.equal(puedeCerrar(luis, { asignadaAId: ana.id, participantes: [ana.id, carlos.id] }), false);
  });

  test("los avisos automáticos no asignan a nadie", async () => {
    const { conversacion } = await conversacionEsperando();
    assert.ok((await escribe(conversacion.id, luis, "Su pedido va en camino", true)).ok);
    assert.deepEqual(await participantes(conversacion.id), []);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } })).asignadaAId, null);
  });

  test("devolver: la persona deja de participar; si era la principal, pasa a quien se sumó; sin nadie, vuelve a «Sin asignar»", async () => {
    const { conversacion } = await conversacionEsperando();
    await escribe(conversacion.id, ana, "Hola");
    await escribe(conversacion.id, carlos, "Yo sigo");
    const r1 = await devolverACola(conversacion.id, ana, "Me toca la caja");
    assert.deepEqual(r1, { ok: true, asignadaA: carlos.nombre });
    assert.deepEqual(await participantes(conversacion.id), [carlos.id]);
    const r2 = await devolverACola(conversacion.id, carlos);
    assert.deepEqual(r2, { ok: true, asignadaA: null });
    const c = await db.conversation.findUniqueOrThrow({ where: { id: conversacion.id } });
    assert.deepEqual([c.asignadaAId, c.atendidaPor, !!c.esperandoAsesorDesde], [null, "nadie", true]); // no se reparte: espera a la vista de todos
    assert.equal((await devolverACola(conversacion.id, luis)).ok, false); // quien no participa no la puede devolver
  });

  test("asignar a mano es un traspaso: la nueva persona entra y la anterior sale", async () => {
    const { conversacion } = await conversacionEsperando();
    await escribe(conversacion.id, ana, "Hola");
    await escribe(conversacion.id, carlos, "Aquí estoy");
    await db.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: conversacion.id }, data: { asignadaAId: luis.id } });
      await participantesAlAsignar(tx, conversacion.id, ana.id, luis.id);
    });
    assert.deepEqual((await participantes(conversacion.id)).sort(), [carlos.id, luis.id].sort());
    await db.$transaction((tx) => participantesAlAsignar(tx, conversacion.id, luis.id, null)); // quitar la asignación: nadie queda
    assert.deepEqual(await participantes(conversacion.id), []);
  });
});
