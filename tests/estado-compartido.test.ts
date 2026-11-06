import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { soltarCandado, tomarCandado } from "@/lib/candados";
import { db } from "@/lib/db";
import { ipDelCliente } from "@/lib/ip";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";

const sufijo = Math.random().toString(36).slice(2);
const clave = (n: string) => `prueba:${n}:${sufijo}`;

after(async () => {
  await db.candado.deleteMany({ where: { clave: { endsWith: sufijo } } });
  await db.intentoTasa.deleteMany({ where: { clave: { endsWith: sufijo } } });
});

describe("candados compartidos (en la base)", () => {
  it("de varios que lo piden a la vez, solo uno lo obtiene", async () => {
    const c = clave("a");
    const r = await Promise.all(Array.from({ length: 8 }, () => tomarCandado(c, 60_000)));
    assert.equal(r.filter(Boolean).length, 1);
  });

  it("al soltarlo se puede tomar otra vez", async () => {
    const c = clave("b");
    assert.equal(await tomarCandado(c, 60_000), true);
    assert.equal(await tomarCandado(c, 60_000), false);
    await soltarCandado(c);
    assert.equal(await tomarCandado(c, 60_000), true);
  });

  it("si el proceso se cae con el candado puesto, vence solo", async () => {
    const c = clave("c");
    assert.equal(await tomarCandado(c, 1), true); // 1 ms
    await new Promise((f) => setTimeout(f, 30));
    assert.equal(await tomarCandado(c, 60_000), true);
  });

  it("claves distintas no se estorban", async () => {
    assert.equal(await tomarCandado(clave("d1"), 60_000), true);
    assert.equal(await tomarCandado(clave("d2"), 60_000), true);
  });
});

describe("límite de intentos (en la base)", () => {
  it("bloquea al llegar al máximo y se limpia al acertar", async () => {
    const c = clave("login");
    assert.equal(await minutosBloqueado(c), 0);
    for (let i = 0; i < 4; i++) await registrarFallo(c);
    assert.equal(await minutosBloqueado(c), 0, "con 4 fallos todavía puede intentar");
    await registrarFallo(c);
    const espera = await minutosBloqueado(c);
    assert.ok(espera >= 1 && espera <= 15, `espera ${espera}`);
    await limpiarFallos(c);
    assert.equal(await minutosBloqueado(c), 0);
  });

  it("acepta otro máximo y otra ventana, y los fallos viejos no cuentan", async () => {
    const c = clave("webhook");
    for (let i = 0; i < 3; i++) await registrarFallo(c);
    assert.ok((await minutosBloqueado(c, 3)) >= 1);
    assert.equal(await minutosBloqueado(c, 3, 1), 0, "con ventana de 1 ms ya pasaron");
  });
});

describe("IP del cliente (solo confiable detrás de un proxy propio)", () => {
  const con = (env: Record<string, string | undefined>, h: Record<string, string>, f: () => void) => {
    const antes = { n: process.env.NODE_ENV, p: process.env.PROXIES_CONFIABLES };
    (process.env as Record<string, string | undefined>).NODE_ENV = env.NODE_ENV;
    process.env.PROXIES_CONFIABLES = env.PROXIES_CONFIABLES;
    try {
      f();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = antes.n;
      if (antes.p === undefined) delete process.env.PROXIES_CONFIABLES;
      else process.env.PROXIES_CONFIABLES = antes.p;
    }
  };

  it("en producción sin proxy declarado no hay IP (el encabezado lo puede escribir cualquiera)", () => {
    con({ NODE_ENV: "production" }, {}, () => assert.equal(ipDelCliente(new Headers({ "x-forwarded-for": "6.6.6.6" })), null));
  });

  it("con un proxy toma la última dirección, no la que escribió el cliente", () => {
    con({ NODE_ENV: "production", PROXIES_CONFIABLES: "1" }, {}, () =>
      assert.equal(ipDelCliente(new Headers({ "x-forwarded-for": "6.6.6.6, 201.1.2.3" })), "201.1.2.3"),
    );
  });

  it("con dos proxies toma la penúltima", () => {
    con({ NODE_ENV: "production", PROXIES_CONFIABLES: "2" }, {}, () =>
      assert.equal(ipDelCliente(new Headers({ "x-forwarded-for": "6.6.6.6, 201.1.2.3, 10.0.0.1" })), "201.1.2.3"),
    );
  });

  it("sin el encabezado, o con menos direcciones de las esperadas, no hay IP", () => {
    con({ NODE_ENV: "production", PROXIES_CONFIABLES: "2" }, {}, () => {
      assert.equal(ipDelCliente(new Headers()), null);
      assert.equal(ipDelCliente(new Headers({ "x-forwarded-for": "201.1.2.3" })), null);
    });
  });

  it("en desarrollo no hay IP (todos entran desde «local»)", () => {
    con({ NODE_ENV: "development" }, {}, () => assert.equal(ipDelCliente(new Headers({ "x-forwarded-for": "6.6.6.6" })), null));
  });
});
