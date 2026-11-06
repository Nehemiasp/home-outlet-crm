import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { db } from "@/lib/db";
import { estaAbierto, horarioValido, type HorarioSemanal } from "@/lib/horario";
import { generarReportes, validarFiltros } from "@/lib/reportes";

const semana: HorarioSemanal = [...Array(6)].map(() => ({ abre: "08:00", cierra: "18:00" })).concat([{ abre: "09:00", cierra: "13:00" }]);
// Guatemala es UTC-6: las 10:00 allá son las 16:00 UTC. El 2 de noviembre de 2026 es lunes y el 1, domingo.
const gt = (dia: number, hora: number, min = 0) => new Date(Date.UTC(2026, 10, dia, hora + 6, min));

describe("horario de la tienda", () => {
  test("abierto y cerrado según el día y la hora de Guatemala", () => {
    assert.equal(estaAbierto(semana, gt(2, 10)), true); // lunes 10:00
    assert.equal(estaAbierto(semana, gt(2, 7, 59)), false); // antes de abrir
    assert.equal(estaAbierto(semana, gt(2, 18)), false); // a la hora de cierre ya está cerrado
    assert.equal(estaAbierto(semana, gt(1, 10)), true); // domingo 10:00
    assert.equal(estaAbierto(semana, gt(1, 14)), false); // domingo después de las 13:00
  });
  test("un día en null es día cerrado, y sin horario se toma como abierto", () => {
    const sinDomingo = [...semana.slice(0, 6), null];
    assert.equal(estaAbierto(sinDomingo, gt(1, 10)), false);
    assert.equal(estaAbierto(null, gt(1, 3)), true);
  });
  test("valida el horario semanal", () => {
    assert.equal(horarioValido(semana), true);
    assert.equal(horarioValido(semana.slice(0, 6)), false); // faltan días
    assert.equal(horarioValido([...semana.slice(0, 6), { abre: "13:00", cierra: "09:00" }]), false); // abre después de cerrar
    assert.equal(horarioValido([...semana.slice(0, 6), { abre: "9:00", cierra: "13:00" }]), false); // formato
  });
});

describe("reportes", () => {
  after(() => db.$disconnect());

  test("valida las fechas y el canal", () => {
    assert.equal(validarFiltros({ desde: "2026-10-01", hasta: "2026-10-31", canal: "todos" }), null);
    assert.match(validarFiltros({ desde: "2026-10-31", hasta: "2026-10-01", canal: "todos" })!, /antes/);
    assert.match(validarFiltros({ desde: "no", hasta: "2026-10-01", canal: "todos" })!, /fechas/);
    assert.match(validarFiltros({ desde: "2024-01-01", hasta: "2026-10-01", canal: "todos" })!, /año/);
    assert.match(validarFiltros({ desde: "2026-10-01", hasta: "2026-10-31", canal: "otro" as never })!, /canal/);
  });

  test("con los 90 días de demostración: indicadores y gráficas coherentes", async () => {
    const r = await generarReportes({ desde: "2026-08-04", hasta: "2026-11-01", canal: "todos" });
    assert.equal(r.rango.dias, 90);
    assert.equal(r.porDia.length, 90);
    assert.equal(r.porHora.length, 24);
    assert.ok(r.indicadores.nuevas > 500, "debe haber cientos de conversaciones");
    // El total de la gráfica por día es el de los indicadores, y el de motivos también.
    const sumaDias = r.porDia.reduce((s, d) => s + Object.values(d.porCanal).reduce((a, b) => a + b, 0), 0);
    assert.equal(sumaDias, r.indicadores.nuevas);
    assert.equal(r.motivos.reduce((s, m) => s + m.total, 0), r.indicadores.nuevas);
    assert.ok(r.indicadores.resueltasPct! >= 0 && r.indicadores.resueltasPct! <= 100);
    assert.ok(r.indicadores.medianaAsistenteSeg! < r.indicadores.medianaAsesorSeg!, "el asistente responde más rápido que las personas");
    assert.ok(r.productos.length > 0 && r.productos.length <= 10);
    assert.deepEqual([...r.productos].sort((a, b) => b.consultas - a.consultas), r.productos);
    assert.ok(r.costoPorDia.some((d) => d.costo > 0));
  });

  test("el filtro por canal solo cuenta ese canal", async () => {
    const todos = await generarReportes({ desde: "2026-10-01", hasta: "2026-10-31", canal: "todos" });
    const wa = await generarReportes({ desde: "2026-10-01", hasta: "2026-10-31", canal: "whatsapp" });
    assert.ok(wa.indicadores.nuevas < todos.indicadores.nuevas);
    assert.deepEqual(wa.canales, ["whatsapp"]);
  });

  test("un rango sin datos devuelve ceros, no errores", async () => {
    const r = await generarReportes({ desde: "2020-01-01", hasta: "2020-01-07", canal: "todos" });
    assert.equal(r.indicadores.nuevas, 0);
    assert.equal(r.indicadores.medianaAsesorSeg, null);
    assert.equal(r.indicadores.resueltasPct, null);
    assert.deepEqual(r.motivos, []);
  });
});
