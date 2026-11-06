import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, describe, test } from "node:test";
import { borrarEtiqueta, borrarRespuesta, cambiarActivo, cambiarRol, crearUsuario, dejaSinAdmin, guardarEtiqueta, guardarNegocio, guardarRespuesta, obtenerNegocio, restablecerClave } from "@/lib/ajustes";
import { cargarConversacion } from "@/lib/bandeja";
import { db } from "@/lib/db";
import { aplicarDatos } from "@/lib/plantillas";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo prueba/PRUEBA y se borra al final.
const CORREO = (n: string) => `prueba-ajustes-${n}@homeoutlet.test`;

describe("respuestas rápidas con datos del negocio", () => {
  const datos = { nombre: "Home Outlet", horario: "Lunes a sábado de 8 a 18", direccion: null };
  test("rellena los datos y deja un marcador si falta alguno", () => {
    assert.equal(aplicarDatos("Somos {negocio}. {horario}.", datos), "Somos Home Outlet. Lunes a sábado de 8 a 18.");
    assert.equal(aplicarDatos("Venga a {direccion}", datos), "Venga a [Dirección: pendiente de confirmar]");
    assert.equal(aplicarDatos("{horario}", { ...datos, horario: "  " }), "[Horario: pendiente de confirmar]");
    assert.equal(aplicarDatos("Sin marcas {otra}", datos), "Sin marcas {otra}");
  });
});

describe("regla del último administrador", () => {
  test("no se puede dejar al sistema sin administradores activos", () => {
    assert.equal(dejaSinAdmin(1, true), true);
    assert.equal(dejaSinAdmin(2, true), false);
    assert.equal(dejaSinAdmin(1, false), false);
  });
});

describe("ajustes (con base de datos)", () => {
  let actor: { id: string; nombre: string };
  let negocioOriginal: Awaited<ReturnType<typeof obtenerNegocio>>;

  before(async () => {
    negocioOriginal = await obtenerNegocio();
    actor = await db.user.create({ data: { nombre: "Admin de ajustes", correo: CORREO("actor"), passwordHash: "x", rol: "admin" } });
  });
  after(async () => {
    await db.conversation.deleteMany({ where: { contacto: { nombre: "PRUEBA-AJ contacto" } } });
    await db.contact.deleteMany({ where: { nombre: "PRUEBA-AJ contacto" } });
    await db.quickReply.deleteMany({ where: { atajo: { startsWith: "/prueba-aj" } } });
    await db.tag.deleteMany({ where: { nombre: { startsWith: "PRUEBA-AJ" } } });
    await guardarNegocio({ nombre: negocioOriginal.nombre, horario: negocioOriginal.horario ?? "", direccion: negocioOriginal.direccion ?? "" });
    const usuarios = await db.user.findMany({ where: { correo: { startsWith: "prueba-ajustes-" } }, select: { id: true } });
    await db.activityLog.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await db.user.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    await db.$disconnect();
  });

  test("usuarios: invitar crea la cuenta con una clave temporal que sirve, y no se repite el correo", async () => {
    const r = await crearUsuario({ nombre: "Agente nuevo", correo: ` ${CORREO("agente").toUpperCase()} `, rol: "agente" }, actor);
    assert.equal(r.ok, true);
    const u = await db.user.findUniqueOrThrow({ where: { correo: CORREO("agente") } });
    assert.equal(u.rol, "agente");
    assert.equal(u.activo, true);
    assert.equal(await bcrypt.compare(r.ok ? r.clave : "", u.passwordHash), true);
    assert.equal((await crearUsuario({ nombre: "Otro", correo: CORREO("agente"), rol: "agente" }, actor)).ok, false);
  });

  test("usuarios: rol, desactivar (deja sin asignar sus conversaciones) y restablecer clave", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { correo: CORREO("agente") } });
    const contacto = await db.contact.create({ data: { nombre: "PRUEBA-AJ contacto" } });
    const conv = await db.conversation.create({ data: { contactoId: contacto.id, canal: "simulado", asignadaAId: u.id } });

    assert.equal((await cambiarRol(actor.id, "agente", actor)).ok, false, "no puede cambiarse el propio rol");
    assert.equal((await cambiarActivo(actor.id, false, actor)).ok, false, "no puede desactivarse a sí mismo");

    assert.deepEqual(await cambiarRol(u.id, "admin", actor), { ok: true });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).rol, "admin");
    assert.deepEqual(await cambiarRol(u.id, "agente", actor), { ok: true });

    const antes = (await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash;
    const nueva = await restablecerClave(u.id, actor);
    assert.equal(nueva.ok, true);
    const despues = (await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash;
    assert.notEqual(antes, despues);
    assert.equal(await bcrypt.compare(nueva.ok ? nueva.clave : "", despues), true);

    assert.deepEqual(await cambiarActivo(u.id, false, actor), { ok: true });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).activo, false);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).asignadaAId, null);
    assert.deepEqual(await cambiarActivo(u.id, true, actor), { ok: true });
  });

  test("respuestas rápidas: valida el atajo, no lo repite, edita y borra", async () => {
    assert.equal((await guardarRespuesta(null, { atajo: "sin-barra", texto: "x" })).ok, false);
    assert.equal((await guardarRespuesta(null, { atajo: "/Con Espacio", texto: "x" })).ok, false);
    assert.equal((await guardarRespuesta(null, { atajo: "/prueba-aj", texto: "  " })).ok, false);
    assert.deepEqual(await guardarRespuesta(null, { atajo: "/PRUEBA-AJ", texto: "Hola" }), { ok: true }); // se guarda en minúsculas
    const r = await db.quickReply.findUniqueOrThrow({ where: { atajo: "/prueba-aj" } });
    assert.equal((await guardarRespuesta(null, { atajo: "/prueba-aj", texto: "Otra" })).ok, false, "atajo repetido");
    assert.deepEqual(await guardarRespuesta(r.id, { atajo: "/prueba-aj", texto: "Hola editada" }), { ok: true }); // conservar su propio atajo es válido
    assert.equal((await db.quickReply.findUniqueOrThrow({ where: { id: r.id } })).texto, "Hola editada");
    await borrarRespuesta(r.id);
    assert.equal(await db.quickReply.findUnique({ where: { id: r.id } }), null);
  });

  test("etiquetas: solo los 6 colores, nombre único, y al borrar se quitan de los contactos sin borrarlos", async () => {
    assert.equal((await guardarEtiqueta(null, { nombre: "PRUEBA-AJ rosa", color: "rosa" })).ok, false);
    assert.equal((await guardarEtiqueta(null, { nombre: " ", color: "gris" })).ok, false);
    assert.deepEqual(await guardarEtiqueta(null, { nombre: "PRUEBA-AJ etiqueta", color: "exito" }), { ok: true });
    assert.equal((await guardarEtiqueta(null, { nombre: "PRUEBA-AJ etiqueta", color: "gris" })).ok, false, "nombre repetido");
    const t = await db.tag.findUniqueOrThrow({ where: { nombre: "PRUEBA-AJ etiqueta" } });
    assert.deepEqual(await guardarEtiqueta(t.id, { nombre: "PRUEBA-AJ etiqueta", color: "error" }), { ok: true });

    const c = await db.contact.findFirstOrThrow({ where: { nombre: "PRUEBA-AJ contacto" } });
    await db.contact.update({ where: { id: c.id }, data: { etiquetas: { connect: { id: t.id } } } });
    await borrarEtiqueta(t.id);
    assert.equal((await db.contact.findUniqueOrThrow({ where: { id: c.id }, include: { etiquetas: true } })).etiquetas.length, 0);
  });

  test("datos del negocio: se guardan y llegan rellenados a las respuestas rápidas de la bandeja", async () => {
    assert.equal((await guardarNegocio({ nombre: " ", horario: "", direccion: "" })).ok, false);
    assert.deepEqual(await guardarNegocio({ nombre: "Home Outlet de prueba", horario: "8 a 18", direccion: "" }), { ok: true });
    await guardarRespuesta(null, { atajo: "/prueba-aj-neg", texto: "Somos {negocio}, abrimos {horario}. Estamos en {direccion}." });

    const contacto = await db.contact.findFirstOrThrow({ where: { nombre: "PRUEBA-AJ contacto" } });
    const conv = await db.conversation.findFirstOrThrow({ where: { contactoId: contacto.id } });
    const dto = await cargarConversacion(conv.id, { id: actor.id, rol: "admin" });
    assert.equal(dto!.respuestasRapidas.find((r) => r.atajo === "/prueba-aj-neg")!.texto, "Somos Home Outlet de prueba, abrimos 8 a 18. Estamos en [Dirección: pendiente de confirmar].");
  });
});
