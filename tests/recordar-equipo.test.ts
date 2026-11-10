import "dotenv/config";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cookieDe, DIAS_RECORDAR, equipoRecordado, firmarEquipo, nombreCookie, recordadoEn } from "@/lib/recordar-equipo";

// «No volver a pedir el código en este equipo por 30 días»: misma cookie, misma IP, mismas credenciales y sin vencer.
const ana = { id: "usuario-ana", passwordHash: "$2a$10$hash-de-ana", totpSecreto: "secreto-cifrado-de-ana" };
const IP = "190.56.10.20";
const AHORA = Date.UTC(2026, 10, 10, 15, 0);
const DIA = 86_400_000;

describe("recordar el equipo para el segundo factor", () => {
  test("recién recordado vale para el mismo usuario y la misma IP, hasta los 30 días", () => {
    const valor = firmarEquipo(ana, IP, AHORA)!;
    assert.ok(valor);
    assert.equal(equipoRecordado(valor, ana, IP, AHORA), true);
    assert.equal(equipoRecordado(valor, ana, IP, AHORA + (DIAS_RECORDAR - 1) * DIA), true);
    assert.equal(equipoRecordado(valor, ana, IP, AHORA + DIAS_RECORDAR * DIA + 1000), false); // vencido: vuelve a pedir el código
  });

  test("desde otra IP, para otro usuario o con las credenciales cambiadas, ya no vale", () => {
    const valor = firmarEquipo(ana, IP, AHORA)!;
    assert.equal(equipoRecordado(valor, ana, "200.1.2.3", AHORA), false);
    assert.equal(equipoRecordado(valor, { ...ana, id: "usuario-carlos" }, IP, AHORA), false);
    assert.equal(equipoRecordado(valor, { ...ana, passwordHash: "$2a$10$clave-restablecida" }, IP, AHORA), false); // el admin restableció la clave
    assert.equal(equipoRecordado(valor, { ...ana, totpSecreto: null }, IP, AHORA), false); // le quitaron el segundo factor
  });

  test("una cookie alterada, inventada o sin IP no sirve", () => {
    const valor = firmarEquipo(ana, IP, AHORA)!;
    const [vence, firma] = valor.split(".");
    assert.equal(equipoRecordado(`${Number(vence) + 86_400 * 365}.${firma}`, ana, IP, AHORA), false); // alargar el vencimiento rompe la firma
    assert.equal(equipoRecordado(`${vence}.${firma!.slice(0, -2)}xx`, ana, IP, AHORA), false);
    for (const basura of ["", "abc", "123", "x.y", ".", `${vence}.`]) assert.equal(equipoRecordado(basura, ana, IP, AHORA), false);
    assert.equal(firmarEquipo(ana, null, AHORA), null); // sin IP confiable no se recuerda
    assert.equal(equipoRecordado(valor, ana, null, AHORA), false);
  });

  test("la cookie se lee del encabezado, una por usuario, y el nombre no muestra el id", () => {
    const valor = firmarEquipo(ana, "local")!;
    const nombre = nombreCookie(ana.id);
    assert.ok(!nombre.includes(ana.id));
    assert.notEqual(nombre, nombreCookie("usuario-carlos"));
    const h = new Headers({ cookie: `otra=1; ${nombre}=${encodeURIComponent(valor)}; ${nombreCookie("usuario-carlos")}=zzz` });
    assert.equal(cookieDe(h, ana.id), valor);
    assert.equal(recordadoEn(h, ana), true); // fuera de producción la IP es «local»
    assert.equal(recordadoEn(new Headers({ cookie: "otra=1" }), ana), false);
  });
});
