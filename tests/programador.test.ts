import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { db } from "@/lib/db";
import { HORA_RESPALDO, horaGuatemala, respaldoSiToca } from "@/lib/programador";

// 02:00 en Guatemala (UTC-6) son las 08:00 UTC.
const a = (utc: string) => new Date(`2026-11-06T${utc}:00Z`);

after(async () => {
  await db.candado.deleteMany({ where: { clave: "respaldo-diario" } });
  await db.$disconnect();
});

describe("tareas programadas", () => {
  test("la hora de Guatemala es UTC-6, también al cruzar la medianoche", () => {
    assert.equal(horaGuatemala(a("08:00")), 2);
    assert.equal(horaGuatemala(a("00:30")), 18);
    assert.equal(horaGuatemala(a("05:59")), 23);
    assert.equal(horaGuatemala(a("06:00")), 0);
    assert.equal(HORA_RESPALDO, 2);
  });

  test("el respaldo solo corre a las 2:00, una vez por noche, y si falla se reintenta", async () => {
    await db.candado.deleteMany({ where: { clave: "respaldo-diario" } });
    let corridas = 0;
    const bien = async () => (corridas++, true);
    const mal = async () => (corridas++, false);

    assert.equal(await respaldoSiToca(a("14:00"), bien), "no toca");
    assert.equal(corridas, 0);

    assert.equal(await respaldoSiToca(a("08:10"), mal), "fallo");
    assert.equal(await respaldoSiToca(a("08:20"), bien), "hecho", "tras un fallo el candado se suelta y se reintenta");
    assert.equal(await respaldoSiToca(a("08:30"), bien), "ocupado", "ya se hizo esta noche");
    assert.equal(corridas, 2);
  });

  test("con varios servidores a la vez, solo uno hace el respaldo", async () => {
    await db.candado.deleteMany({ where: { clave: "respaldo-diario" } });
    let corridas = 0;
    const r = await Promise.all(Array.from({ length: 5 }, () => respaldoSiToca(a("08:05"), async () => (corridas++, true))));
    assert.equal(corridas, 1);
    assert.equal(r.filter((x) => x === "hecho").length, 1);
  });
});
