import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { db } from "@/lib/db";
import { evaluarPrimerosPasos } from "@/lib/primeros-pasos";

// Necesita la base de datos (npm run db). Los pasos se calculan con lo que hay en la base, no con interruptores.

after(async () => {
  await db.user.deleteMany({ where: { correo: "paso-demo@homeoutlet.test" } });
  await db.$disconnect();
});

describe("primeros pasos", () => {
  test("cada paso tiene identificador único, título, detalle y, si no está hecho y se hace en el sistema, un enlace", async () => {
    const pasos = await evaluarPrimerosPasos();
    assert.ok(pasos.length >= 8);
    assert.equal(new Set(pasos.map((p) => p.id)).size, pasos.length);
    for (const p of pasos) {
      assert.ok(p.titulo && p.detalle, p.id);
      assert.equal(typeof p.hecho, "boolean");
      if (p.href) assert.match(p.href, /^\//, p.id);
      if (p.accion) assert.ok(p.href, `${p.id}: una acción sin enlace`);
    }
  });

  test("un usuario de demostración mantiene pendiente «Sin datos de demostración»", async () => {
    await db.user.create({ data: { nombre: "PRUEBA paso demo", correo: "paso-demo@homeoutlet.test", rol: "agente", passwordHash: "x" } });
    const paso = (await evaluarPrimerosPasos()).find((p) => p.id === "demo");
    assert.equal(paso?.hecho, false);
  });

  test("el paso del equipo cuenta solo agentes activos", async () => {
    const antes = (await evaluarPrimerosPasos()).find((p) => p.id === "equipo")!.hecho;
    const agentes = await db.user.count({ where: { rol: "agente", activo: true } });
    assert.equal(antes, agentes > 0);
  });
});
