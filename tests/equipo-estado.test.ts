import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { alCerrarSesion, alIniciarSesion, activar, desconectarInactivos, pausar, registrarLatido } from "@/lib/equipo/estado";
import { SIN_SENAL_MS } from "@/lib/equipo/tipos";
import { aislar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Crea usuarios con el prefijo PRUEBA-EQ y los borra al terminar.

describe("estados del asesor (con base de datos)", () => {
  let a: string;
  let admin: string;
  const crear = (correo: string, rol: "admin" | "agente") => db.user.create({ data: { nombre: `PRUEBA-EQ ${correo}`, correo: `${correo}@prueba-eq.test`, passwordHash: "x", rol } });
  const estado = (id: string) => db.user.findUniqueOrThrow({ where: { id }, select: { estadoAsesor: true, motivoPausa: true, ultimaSenal: true } });
  const historial = (id: string) => db.historialEstadoAsesor.findMany({ where: { usuarioId: id }, orderBy: { inicio: "asc" } });

  before(async () => {
    await aislar({ modoAsignacion: "manual" }); // estas pruebas no deben repartir las conversaciones de la base
    a = (await crear("a", "agente")).id;
    admin = (await crear("admin", "admin")).id;
  });
  after(async () => {
    await db.user.deleteMany({ where: { correo: { endsWith: "@prueba-eq.test" } } });
    await restaurar();
    await db.$disconnect();
  });

  test("al iniciar sesión queda Disponible y se guarda el tramo en el historial", async () => {
    assert.equal(await alIniciarSesion(a), true);
    assert.equal((await estado(a)).estadoAsesor, "disponible");
    const h = await historial(a);
    assert.equal(h.length, 1);
    assert.equal(h[0]!.origen, "inicio_sesion");
    assert.equal(h[0]!.fin, null);
  });

  test("repetir el mismo estado no hace nada ni duplica el historial", async () => {
    assert.equal(await alIniciarSesion(a), false);
    assert.equal((await historial(a)).length, 1);
  });

  test("pausar guarda el motivo y cierra el tramo anterior; activarse lo reabre como Disponible", async () => {
    assert.equal(await pausar(a, "Almuerzo"), true);
    assert.deepEqual({ ...(await estado(a)), ultimaSenal: undefined }, { estadoAsesor: "en_pausa", motivoPausa: "Almuerzo", ultimaSenal: undefined });
    let h = await historial(a);
    assert.equal(h.length, 2);
    assert.ok(h[0]!.fin, "el tramo Disponible quedó cerrado");
    assert.equal(h[1]!.motivo, "Almuerzo");
    assert.equal(h[1]!.fin, null);

    assert.equal(await activar(a), true);
    const e = await estado(a);
    assert.equal(e.estadoAsesor, "disponible");
    assert.equal(e.motivoPausa, null);
    h = await historial(a);
    assert.equal(h.filter((x) => x.fin === null).length, 1, "solo un tramo vigente");
  });

  test("no se puede pausar a alguien que está Desconectado", async () => {
    await alCerrarSesion(a);
    assert.equal((await estado(a)).estadoAsesor, "desconectado");
    assert.equal(await pausar(a, null), false);
  });

  test("el latido devuelve a Disponible a quien estaba Desconectado, pero no saca a nadie de la pausa", async () => {
    await registrarLatido({ id: a, rol: "agente" });
    assert.equal((await estado(a)).estadoAsesor, "disponible");
    assert.equal((await historial(a)).at(-1)!.origen, "latido");
    await pausar(a, "Otro");
    await registrarLatido({ id: a, rol: "agente" });
    assert.equal((await estado(a)).estadoAsesor, "en_pausa");
  });

  test("5 minutos sin señal pasan a Desconectado, también desde la pausa; con señal reciente no", async () => {
    const ahora = new Date();
    await db.user.update({ where: { id: a }, data: { ultimaSenal: new Date(ahora.getTime() - SIN_SENAL_MS + 30_000) } });
    assert.equal(await desconectarInactivos({ ahora, forzar: true, soloEstos: [a] }), 0, "a los 4 min 30 s todavía está conectado");
    assert.equal((await estado(a)).estadoAsesor, "en_pausa");

    await db.user.update({ where: { id: a }, data: { ultimaSenal: new Date(ahora.getTime() - SIN_SENAL_MS - 1_000) } });
    assert.equal(await desconectarInactivos({ ahora, forzar: true, soloEstos: [a] }), 1);
    assert.equal((await estado(a)).estadoAsesor, "desconectado");
    assert.equal((await historial(a)).at(-1)!.origen, "sin_senal");
  });

  test("un latido que llega justo antes de la tarea evita la desconexión", async () => {
    await db.user.update({ where: { id: a }, data: { estadoAsesor: "disponible", ultimaSenal: new Date(Date.now() - SIN_SENAL_MS - 1_000) } });
    await registrarLatido({ id: a, rol: "agente" }); // señal nueva
    assert.equal(await desconectarInactivos({ forzar: true, soloEstos: [a] }), 0);
    assert.equal((await estado(a)).estadoAsesor, "disponible");
  });

  test("los administradores no tienen estado: nada cambia, aunque sí guardan su señal", async () => {
    assert.equal(await alIniciarSesion(admin), false);
    assert.equal(await pausar(admin, null), false);
    await registrarLatido({ id: admin, rol: "admin" });
    const e = await estado(admin);
    assert.equal(e.estadoAsesor, "desconectado");
    assert.ok(e.ultimaSenal);
    assert.equal((await historial(admin)).length, 0);
  });
});
