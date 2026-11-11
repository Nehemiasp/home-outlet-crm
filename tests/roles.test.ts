import "dotenv/config";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { cambiarRol, crearUsuario as crearUsuarioAjustes } from "@/lib/ajustes";
import { cargarConversacion, listarConversaciones } from "@/lib/bandeja";
import type { Filtros } from "@/lib/bandeja-tipos";
import { db } from "@/lib/db";
import { Rol as RolPrisma } from "@/generated/prisma/client";
import { NOMBRE_ROL, ROLES, esAdmin, puedeAsignar, puedeCancelarPedido, puedeCerrar, puedeDescontar, puedeGestionarProductos, puedeSobrePedido, puedeUnirContactos, puedeDespachar, puedeVerAjustes, puedeVerReporteAsesores, puedeVerReportes, puedeVerificarPagos, requiereSegundoFactor, veTodo, type Actor, type Rol } from "@/lib/permisos";
import { puedeVerConversacion, restringido } from "@/lib/visibilidad";
import { aislar, conversacionEsperando, crearUsuario, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Tres roles: administrador, jefe de tienda y agente.

const act = (rol: Rol, id = "u1"): Actor => ({ id, rol });

describe("permisos por rol (funciones puras)", () => {
  test("los roles del código son exactamente los de la base de datos", () => {
    assert.deepEqual([...ROLES].sort(), Object.values(RolPrisma).sort());
    for (const r of ROLES) assert.ok(NOMBRE_ROL[r]);
  });

  test("solo el administrador ve ajustes, usuarios, canales, simulador y guía de estilo", () => {
    assert.equal(puedeVerAjustes(act("admin")), true);
    assert.equal(puedeVerAjustes(act("jefe_tienda")), false);
    assert.equal(puedeVerAjustes(act("agente")), false);
    assert.equal(esAdmin(act("jefe_tienda")), false);
  });

  test("el jefe de tienda hace lo operativo igual que el administrador", () => {
    for (const rol of ["admin", "jefe_tienda"] as const) {
      const u = act(rol);
      assert.equal(veTodo(u), true, rol);
      assert.equal(puedeVerReportes(u), true, rol);
      assert.equal(puedeGestionarProductos(u), true, rol);
      assert.equal(puedeUnirContactos(u), true, rol);
      assert.equal(puedeSobrePedido(u), true, rol);
      assert.equal(puedeVerificarPagos(u), true, rol);
      assert.equal(puedeDescontar(u, 9_999, 10_000, 0), true, `${rol} descuenta sin tope`);
      assert.equal(puedeCancelarPedido(u, { creadoPorId: "otro" }, true), true, rol);
      assert.equal(puedeAsignar(u, { asignadaAId: "otro" }, "tercero"), true, rol);
      assert.equal(puedeCerrar(u, { asignadaAId: "otro" }), true, rol);
    }
  });

  test("oficina hace lo operativo como el jefe de tienda, pero sin reportes, sin ajustes y sin segundo factor", () => {
    const u = act("oficina");
    assert.equal(NOMBRE_ROL.oficina, "Oficina");
    for (const permiso of [veTodo, puedeGestionarProductos, puedeUnirContactos, puedeSobrePedido, puedeVerificarPagos, puedeDespachar]) assert.equal(permiso(u), true, permiso.name);
    assert.equal(puedeAsignar(u, { asignadaAId: "otro" }, "tercero"), true);
    assert.equal(puedeDescontar(u, 9_999, 10_000, 0), true);
    assert.equal(puedeVerReportes(u), false);
    assert.equal(puedeVerReporteAsesores(u), false);
    assert.equal(puedeVerAjustes(u), false);
    assert.equal(requiereSegundoFactor(u), false);
  });

  test("el reporte de asesores es solo del administrador", () => {
    assert.equal(puedeVerReporteAsesores(act("admin")), true);
    for (const rol of ["jefe_tienda", "oficina", "agente", "bodega"] as const) assert.equal(puedeVerReporteAsesores(act(rol)), false, rol);
  });

  test("el agente conserva sus límites", () => {
    const u = act("agente");
    assert.equal(veTodo(u), false);
    assert.equal(puedeVerReportes(u), false);
    assert.equal(puedeGestionarProductos(u), false);
    assert.equal(puedeUnirContactos(u), false);
    assert.equal(puedeSobrePedido(u), false);
    assert.equal(puedeVerificarPagos(u), false);
    assert.equal(puedeVerificarPagos({ ...u, puedeVerificarPagos: true }), true);
    assert.equal(puedeDescontar(u, 1_000, 10_000, 10), true);
    assert.equal(puedeDescontar(u, 1_001, 10_000, 10), false);
    assert.equal(puedeCancelarPedido(u, { creadoPorId: "u1" }, false), true);
    assert.equal(puedeCancelarPedido(u, { creadoPorId: "u1" }, true), false);
    assert.equal(puedeAsignar(u, { asignadaAId: "otro" }, "u1"), false);
  });
});

// Guardia contra olvidos: ningún archivo vuelve a comparar el rol con «admin» a mano (se usan las funciones de lib/permisos.ts),
// y solo las pantallas de configuración exigen ser administrador.
describe("el código no se salta los permisos por rol", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const ruta = path.join(dir, n);
      if (statSync(ruta).isDirectory()) return n === "node_modules" || n === ".next" ? [] : archivos(ruta);
      return /\.(ts|tsx)$/.test(n) ? [ruta] : [];
    });
  const fuentes = ["app", "lib", "components"].flatMap((d) => archivos(d)).map((f) => f.split(path.sep).join("/"));

  test("nadie compara `rol === \"admin\"` salvo el conteo de administradores activos", () => {
    const usos = fuentes.filter((f) => /\.rol\s*[!=]==\s*"admin"/.test(readFileSync(f, "utf8")));
    assert.deepEqual(usos, ["lib/ajustes.ts", "lib/limpieza.ts", "lib/permisos.ts"]); // permisos.ts define `esAdmin`; ajustes.ts y limpieza.ts cuentan los administradores activos
  });

  test("solo estas pantallas y acciones exigen ser administrador", () => {
    const permitidas = ["app/(app)/ajustes/equipo/page.tsx", "app/(app)/ajustes/layout.tsx", "app/(app)/ajustes/usuarios/page.tsx", "app/(app)/simulador/actions.ts", "app/(app)/simulador/page.tsx", "app/(app)/sistema/page.tsx"];
    const usos = fuentes.filter((f) => /requireUsuario\("admin"\)/.test(readFileSync(f, "utf8")));
    assert.deepEqual(usos.sort(), permitidas);
  });
});

describe("el jefe de tienda y el agente en la práctica (con base de datos)", () => {
  let jefe: Actor, agente: Actor, otro: Actor;
  let suya: Awaited<ReturnType<typeof conversacionEsperando>>, ajena: typeof suya;
  const filtros: Filtros = { tab: "todas", atencion: "todas", estado: "todos", canal: "todos", asesor: "todos", q: "", limite: 50 };

  before(async () => {
    await aislar({ asesoresVenSoloSuyas: true });
    jefe = { id: (await crearUsuario("rjefe", "jefe_tienda")).id, rol: "jefe_tienda" };
    agente = { id: (await crearUsuario("ragente")).id, rol: "agente" };
    otro = { id: (await crearUsuario("rotro")).id, rol: "agente" };
    suya = await conversacionEsperando({ asignadaAId: agente.id });
    ajena = await conversacionEsperando({ asignadaAId: otro.id });
  });
  after(async () => {
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("con la visibilidad limitada, el agente no ve lo ajeno y el jefe de tienda sí lo ve todo", async () => {
    assert.equal(await restringido(agente), true);
    assert.equal(await restringido(jefe), false);
    assert.equal(await puedeVerConversacion(agente, ajena.conversacion.id), false);
    assert.equal(await puedeVerConversacion(jefe, ajena.conversacion.id), true);
    assert.equal(await puedeVerConversacion(jefe, suya.conversacion.id), true);
    assert.ok(await cargarConversacion(ajena.conversacion.id, jefe));
    assert.equal(await cargarConversacion(ajena.conversacion.id, agente), null);
  });

  test("el jefe de tienda ve las dos conversaciones en la lista y puede filtrar por asesor; el agente solo la suya", async () => {
    const ids = async (u: Actor, f: Partial<Filtros> = {}) => (await listarConversaciones({ ...filtros, ...f }, u)).items.map((c) => c.id);
    const delJefe = await ids(jefe);
    assert.ok(delJefe.includes(suya.conversacion.id) && delJefe.includes(ajena.conversacion.id));
    assert.deepEqual(await ids(jefe, { asesor: otro.id }), [ajena.conversacion.id]);
    const delAgente = await ids(agente);
    assert.ok(delAgente.includes(suya.conversacion.id) && !delAgente.includes(ajena.conversacion.id));
  });

  test("el administrador puede dar y quitar el rol de jefe de tienda, y siempre queda un administrador", async () => {
    const admin = { id: (await crearUsuario("radmin", "admin")).id, nombre: "PRUEBA-EQ radmin" };
    assert.deepEqual(await cambiarRol(agente.id, "jefe_tienda", admin), { ok: true });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: agente.id } })).rol, "jefe_tienda");
    assert.deepEqual(await cambiarRol(agente.id, "agente", admin), { ok: true });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: agente.id } })).rol, "agente");
    const r = await crearUsuarioAjustes({ nombre: "PRUEBA-EQ nuevo jefe", correo: "nuevo-jefe@prueba-eq.test", rol: "jefe_tienda" }, admin);
    assert.ok(r.ok);
    assert.equal((await db.user.findUniqueOrThrow({ where: { correo: "nuevo-jefe@prueba-eq.test" } })).rol, "jefe_tienda");
  });
});
