import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { contarDatos, esUsuarioDemo, limpiarDatosDemo } from "@/lib/limpieza";

// Salir de la demostración, sobre una base de prueba aparte (se crea, se llena con la semilla y se borra): nunca toca la base de trabajo.
const BASE = "homeoutlet_limpieza_prueba";
const principal = process.env.DATABASE_URL!;
const url = principal.replace(/\/[^/]+$/, `/${BASE}`);
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "development" } as NodeJS.ProcessEnv;
const correr = (args: string[], extra: Record<string, string> = {}) => spawnSync("npx", args, { env: { ...env, ...extra }, shell: true, encoding: "utf8", cwd: process.cwd() });

describe("salir de la demostración (base de prueba aparte)", { timeout: 300_000 }, () => {
  let db: PrismaClient;
  let usuariosInicio: number;

  before(async () => {
    const admin = new pg.Client({ connectionString: principal.replace(/\/[^/]+$/, "/postgres") });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
    await admin.query(`CREATE DATABASE ${BASE}`);
    await admin.end();
    assert.equal(correr(["prisma", "migrate", "deploy"]).status, 0, "las migraciones se aplican desde cero");
    assert.equal(correr(["tsx", "prisma/seed.ts"]).status, 0, "la semilla corre");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    usuariosInicio = await db.user.count();
  });
  after(async () => {
    await db?.$disconnect();
    const admin = new pg.Client({ connectionString: principal.replace(/\/[^/]+$/, "/postgres") });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
    await admin.end();
  });

  test("la base de demostración tiene datos y el script, sin confirmar, no cambia nada", async () => {
    const antes = await contarDatos(db);
    assert.ok((antes.Contact ?? 0) > 100 && (antes.Order ?? 0) > 10 && (antes.Product ?? 0) > 10 && (antes.Conversation ?? 0) > 100, JSON.stringify(antes));
    const r = correr(["tsx", "scripts/limpiar-demo.mts"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No se cambió nada/);
    assert.deepEqual(await contarDatos(db), antes);
  });

  test("el script exige --confirmar y el nombre correcto de la base, y no corre en producción", async () => {
    const antes = await contarDatos(db);
    const sinBase = correr(["tsx", "scripts/limpiar-demo.mts", "--confirmar"]);
    assert.notEqual(sinBase.status, 0);
    assert.match(sinBase.stderr, /--base homeoutlet_limpieza_prueba/);
    const otraBase = correr(["tsx", "scripts/limpiar-demo.mts", "--confirmar", "--base", "homeoutlet"]);
    assert.notEqual(otraBase.status, 0);
    const produccion = correr(["tsx", "scripts/limpiar-demo.mts", "--confirmar", "--base", BASE], { NODE_ENV: "production" });
    assert.notEqual(produccion.status, 0);
    assert.match(produccion.stderr, /producción/);
    assert.deepEqual(await contarDatos(db), antes, "ninguno de los tres intentos borró nada");
  });

  test("quitar a los usuarios de demostración sin otro administrador se rechaza y no cambia nada", async () => {
    const antes = await contarDatos(db);
    await assert.rejects(limpiarDatosDemo(db, { quitarUsuariosDemo: true }), /sin ningún administrador/);
    assert.deepEqual(await contarDatos(db), antes);
    assert.equal(await db.user.count(), usuariosInicio);
  });

  test("al limpiar queda todo vacío, los usuarios intactos y las filas de ajustes y ubicaciones en blanco", async () => {
    const r = await limpiarDatosDemo(db);
    assert.ok(Object.keys(r.borrado).length > 10);
    assert.deepEqual(r.usuariosQuitados, []);
    assert.equal(await db.user.count(), usuariosInicio);

    const quedan = await contarDatos(db);
    // Solo las filas base que el sistema necesita: un negocio, la IA, el equipo, los pedidos y las dos ubicaciones.
    assert.deepEqual(quedan, { AiSettings: 1, AjustesEquipo: 1, AjustesPedidos: 1, Location: 2, Negocio: 1 });
    const pedidos = await db.ajustesPedidos.findUniqueOrThrow({ where: { id: "pedidos" } });
    assert.equal(pedidos.siguienteNumero, 1, "el primer pedido real será HO-000001");
    assert.equal(pedidos.prefijo, "HO-");
    assert.ok(pedidos.ubicacionRecogerId && pedidos.ubicacionEnvioId);
    assert.deepEqual((await db.location.findMany({ orderBy: { nombre: "asc" } })).map((l) => l.nombre), ["Tienda en línea", "Tienda física"]);
    const negocio = await db.negocio.findUniqueOrThrow({ where: { id: "negocio" } });
    assert.equal(negocio.direccion, null);
  });

  test("con --quitar-usuarios-demo se van los de demostración y se queda el administrador real", async () => {
    await db.user.create({ data: { nombre: "Admin Real", correo: "real@empresa.com", rol: "admin", passwordHash: "x" } });
    const r = await limpiarDatosDemo(db, { quitarUsuariosDemo: true });
    assert.ok(r.usuariosQuitados.length >= 3 && r.usuariosQuitados.every(esUsuarioDemo));
    assert.deepEqual((await db.user.findMany({ select: { correo: true } })).map((u) => u.correo), ["real@empresa.com"]);
  });

  test("la detección de usuarios de demostración", () => {
    assert.equal(esUsuarioDemo("admin@homeoutlet.test"), true);
    assert.equal(esUsuarioDemo("ANA@HomeOutlet.TEST"), true);
    assert.equal(esUsuarioDemo("ana@homeoutlet.com.gt"), false);
  });
});
