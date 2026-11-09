import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { MINUTOS_INACTIVIDAD, SEGUNDOS_DE_AVISO, estadoInactividad } from "@/lib/inactividad";

const MIN = 60_000;

describe("cierre de sesión por inactividad", () => {
  test("30 minutos sin usar el sistema, con aviso el último minuto", () => {
    assert.equal(MINUTOS_INACTIVIDAD, 30);
    assert.equal(SEGUNDOS_DE_AVISO, 60);
    const t0 = Date.UTC(2026, 10, 8, 18, 0);
    assert.deepEqual(estadoInactividad(t0, t0), { tipo: "activo" });
    assert.deepEqual(estadoInactividad(t0, t0 + 29 * MIN - 1), { tipo: "activo" });
    assert.deepEqual(estadoInactividad(t0, t0 + 29 * MIN), { tipo: "aviso", segundos: 60 });
    assert.deepEqual(estadoInactividad(t0, t0 + 30 * MIN - 1500), { tipo: "aviso", segundos: 2 }); // se redondea hacia arriba: nunca muestra «0 s» antes de cerrar
    assert.deepEqual(estadoInactividad(t0, t0 + 30 * MIN), { tipo: "cerrar" });
    assert.deepEqual(estadoInactividad(t0, t0 + 5 * 60 * MIN), { tipo: "cerrar" }); // al volver de una suspensión larga cierra sin aviso
  });

  test("el latido no cuenta como actividad: el marco solo escucha ratón, teclado y pantalla táctil", () => {
    const codigo = readFileSync("components/shell/inactividad.tsx", "utf8");
    assert.ok(!/import[^;]*(latido|tiempo-real)/.test(codigo), "el cierre por inactividad no debe depender del latido ni de las actualizaciones periódicas");
    assert.ok(readFileSync("app/(app)/layout.tsx", "utf8").includes("<CierrePorInactividad />"), "el marco de la aplicación debe incluir el cierre por inactividad");
  });
});
