import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, describe, test } from "node:test";
import { quitarSegundoFactor, listarUsuarios } from "@/lib/ajustes";
import { verificarClave, verificarSegundoFactor } from "@/lib/credenciales";
import { db } from "@/lib/db";
import { aBase32, cifrar, codigoTotp, deBase32, descifrar, huellaRespaldo, nuevoSecreto, nuevosRespaldos, pareceRespaldo, pasoDe, secretoEnGrupos, uriOtpauth, verificarTotp } from "@/lib/segundo-factor";
import { confirmarActivacion, iniciarActivacion } from "@/lib/segundo-factor-servicio";
import { huellaDeClave, segundoFactorObligatorio, segundoFactorPendiente, sesionVigente } from "@/lib/sesion-vigente";

// El núcleo se prueba con los vectores oficiales del RFC 6238; la parte con base de datos necesita npm run db.

describe("el código de 6 dígitos (RFC 6238)", () => {
  const SECRETO = aBase32(Buffer.from("12345678901234567890")); // el secreto de los vectores del RFC
  test("el secreto de los vectores en base 32 es el conocido", () => assert.equal(SECRETO, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"));

  test("da los códigos oficiales del RFC 6238 (sus 6 últimos dígitos)", () => {
    for (const [segundos, esperado] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]] as const) {
      assert.equal(codigoTotp(SECRETO, pasoDe(segundos * 1000)), esperado, `a los ${segundos} s`);
    }
  });

  test("base 32 va y vuelve, y un secreto nuevo tiene 160 bits", () => {
    for (let i = 0; i < 20; i++) {
      const s = nuevoSecreto();
      assert.match(s, /^[A-Z2-7]{32}$/);
      assert.equal(aBase32(deBase32(s)), s);
    }
    assert.notEqual(nuevoSecreto(), nuevoSecreto());
    assert.equal(deBase32("gezd gnbv").toString(), "12345"); // acepta minúsculas y espacios
  });

  const ms = 1_700_000_000_000;
  const paso = pasoDe(ms);
  test("acepta el intervalo actual, el anterior y el siguiente; no el de 2 antes ni 2 después", () => {
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso), 0, ms), paso);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso - 1), 0, ms), paso - 1);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso + 1), 0, ms), paso + 1);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso - 2), 0, ms), null);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso + 2), 0, ms), null);
  });

  test("un mismo código no sirve dos veces: solo vale uno más nuevo que el último usado", () => {
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso), paso, ms), null);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso - 1), paso, ms), null);
    assert.equal(verificarTotp(SECRETO, codigoTotp(SECRETO, paso + 1), paso, ms), paso + 1);
  });

  test("rechaza lo que no tiene forma de código, y tolera un espacio en medio", () => {
    for (const mal of ["", "12345", "1234567", "abcdef", "12 34 5a", codigoTotp(SECRETO, paso).slice(0, 5)]) assert.equal(verificarTotp(SECRETO, mal, 0, ms), null, mal);
    const bueno = codigoTotp(SECRETO, paso);
    assert.equal(verificarTotp(SECRETO, `${bueno.slice(0, 3)} ${bueno.slice(3)}`, 0, ms), paso);
    assert.equal(verificarTotp(nuevoSecreto(), bueno, 0, ms), null, "con otro secreto no pasa");
  });

  test("la dirección del QR y la clave en grupos", () => {
    const uri = uriOtpauth(SECRETO, "ana@homeoutlet.test");
    assert.equal(uri, `otpauth://totp/Home%20Outlet:ana%40homeoutlet.test?secret=${SECRETO}&issuer=Home%20Outlet&algorithm=SHA1&digits=6&period=30`);
    assert.equal(secretoEnGrupos("ABCDEFGHIJ"), "ABCD EFGH IJ");
  });
});

describe("secreto cifrado y códigos de respaldo", () => {
  test("el secreto se guarda cifrado, distinto cada vez, y vuelve igual", () => {
    const s = nuevoSecreto();
    const a = cifrar(s);
    assert.equal(a.includes(s), false);
    assert.notEqual(cifrar(s), a, "un vector de inicio nuevo cada vez");
    assert.equal(descifrar(a), s);
  });

  test("un texto alterado, roto, o cifrado con otro AUTH_SECRET no se descifra", () => {
    const a = cifrar("SECRETO");
    const [iv, etiqueta, datos] = a.split(".");
    assert.equal(descifrar(`${iv}.${etiqueta}.${Buffer.from("otra cosa").toString("base64")}`), null);
    assert.equal(descifrar("no es un secreto"), null);
    assert.equal(descifrar(""), null);
    const previo = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = `${previo}-otro`;
    try {
      assert.equal(descifrar(a), null);
    } finally {
      process.env.AUTH_SECRET = previo;
    }
    assert.equal(descifrar(`${iv}.${etiqueta}.${datos}`), "SECRETO");
  });

  test("sin AUTH_SECRET no se puede cifrar (no se guarda con una clave vacía)", () => {
    const previo = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      assert.throws(() => cifrar("x"), /AUTH_SECRET/);
    } finally {
      process.env.AUTH_SECRET = previo;
    }
  });

  test("8 códigos de respaldo distintos, con forma reconocible, y su huella ignora mayúsculas, espacios y el guion", () => {
    const codigos = nuevosRespaldos();
    assert.equal(codigos.length, 8);
    assert.equal(new Set(codigos).size, 8);
    for (const c of codigos) {
      assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
      assert.equal(pareceRespaldo(c), true);
      assert.equal(huellaRespaldo(c.toUpperCase()), huellaRespaldo(c));
      assert.equal(huellaRespaldo(` ${c.replace("-", "")} `), huellaRespaldo(c));
    }
    assert.equal(pareceRespaldo("123456"), false, "un código de la aplicación no es un respaldo");
    assert.equal(pareceRespaldo("corto"), false);
  });
});

describe("cuándo falta el segundo factor", () => {
  const admin = { rol: "admin" as const };
  test("obligatorio en producción y con SEGUNDO_FACTOR=1; en desarrollo normal, no", () => {
    assert.equal(segundoFactorObligatorio({ NODE_ENV: "production" }), true);
    assert.equal(segundoFactorObligatorio({ NODE_ENV: "production", SEGUNDO_FACTOR: "0" }), true, "en producción no se puede apagar");
    assert.equal(segundoFactorObligatorio({ NODE_ENV: "development", SEGUNDO_FACTOR: "1" }), true);
    assert.equal(segundoFactorObligatorio({ NODE_ENV: "development" }), false);
  });

  test("falta solo para administrador y jefe de tienda que no lo verificaron al entrar; nunca para los demás roles", () => {
    assert.equal(segundoFactorPendiente(admin, false, true), true);
    assert.equal(segundoFactorPendiente(admin, undefined, true), true, "una sesión anterior a este control");
    assert.equal(segundoFactorPendiente({ rol: "jefe_tienda" }, false, true), true);
    assert.equal(segundoFactorPendiente(admin, true, true), false);
    assert.equal(segundoFactorPendiente({ rol: "agente" }, false, true), false);
    assert.equal(segundoFactorPendiente({ rol: "bodega" }, undefined, true), false);
    assert.equal(segundoFactorPendiente(admin, false, false), false, "si no es obligatorio, no falta");
  });

  test("quien entró como agente y luego pasa a administrador queda pendiente (no hereda un «verificado» que nunca dio)", () => {
    assert.equal(segundoFactorPendiente({ rol: "agente" }, false, true), false);
    assert.equal(segundoFactorPendiente({ rol: "admin" }, false, true), true);
  });

  test("la huella de la sesión cambia al activar, cambiar o quitar el segundo factor", () => {
    const u = { activo: true, passwordHash: "hash", totpSecreto: null as string | null };
    const antes = huellaDeClave("hash", null);
    assert.equal(sesionVigente(u, antes), true);
    assert.equal(sesionVigente({ ...u, totpSecreto: "cifrado" }, antes), false, "activarlo cierra la sesión a medias");
    assert.equal(sesionVigente({ ...u, totpSecreto: "cifrado" }, huellaDeClave("hash", "cifrado")), true);
    assert.equal(sesionVigente(u, huellaDeClave("hash", "cifrado")), false, "quitarlo cierra las sesiones abiertas");
  });
});

describe("activar y usar el segundo factor (con base de datos)", () => {
  const CORREO = "prueba-2f@homeoutlet.test";
  const CLAVE = "clave-de-prueba-2f";
  const CORREO_OTRO = "prueba-2f-otro@homeoutlet.test";
  let id: string;
  let otroId: string;
  let secreto = "";
  let respaldos: string[] = [];
  const usuario = () => db.user.findUniqueOrThrow({ where: { id } });

  before(async () => {
    await db.user.deleteMany({ where: { correo: { in: [CORREO, CORREO_OTRO] } } });
    id = (await db.user.create({ data: { nombre: "PRUEBA-2F admin", correo: CORREO, passwordHash: await bcrypt.hash(CLAVE, 4), rol: "admin" } })).id;
    otroId = (await db.user.create({ data: { nombre: "PRUEBA-2F otro admin", correo: CORREO_OTRO, passwordHash: await bcrypt.hash(CLAVE, 4), rol: "admin" } })).id;
  });
  after(async () => {
    await db.activityLog.deleteMany({ where: { OR: [{ entidadId: id }, { usuarioId: otroId }] } });
    await db.user.deleteMany({ where: { correo: { in: [CORREO, CORREO_OTRO] } } });
    await db.$disconnect();
  });

  test("la contraseña se verifica sin decir qué falló, y un usuario desactivado no entra", async () => {
    assert.equal((await verificarClave(CORREO, CLAVE))?.id, id);
    assert.equal(await verificarClave(CORREO, "otra"), null);
    assert.equal(await verificarClave("nadie@homeoutlet.test", CLAVE), null);
    await db.user.update({ where: { id }, data: { activo: false } });
    assert.equal(await verificarClave(CORREO, CLAVE), null);
    await db.user.update({ where: { id }, data: { activo: true } });
  });

  test("iniciar la activación da un QR (imagen) y la clave en grupos; recargar la página reutiliza el mismo secreto", async () => {
    const a = await iniciarActivacion(id);
    assert.ok(a.ok);
    assert.match(a.qr, /^data:image\/gif;base64,/);
    assert.match(a.secreto, /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    const b = await iniciarActivacion(id);
    assert.ok(b.ok && b.secreto === a.secreto, "el QR ya escaneado sigue sirviendo");
    secreto = a.secreto.replace(/ /g, "");
    const u = await usuario();
    assert.equal(u.totpSecreto, null, "todavía no cuenta: falta confirmarlo");
    assert.ok(u.totpPendiente && !u.totpPendiente.includes(secreto), "el pendiente está cifrado");
  });

  test("un código equivocado no activa nada; el correcto activa y da 8 códigos de respaldo que en la base solo están como huella", async () => {
    const mal = await confirmarActivacion(id, "000000");
    assert.equal(mal.ok, false);
    assert.equal((await usuario()).totpSecreto, null);

    const bien = await confirmarActivacion(id, codigoTotp(secreto, pasoDe()));
    assert.ok(bien.ok);
    respaldos = bien.respaldos;
    assert.equal(respaldos.length, 8);
    const u = await usuario();
    assert.ok(u.totpSecreto && u.totpPendiente === null);
    assert.equal(descifrar(u.totpSecreto), secreto, "el secreto definitivo es el que se escaneó");
    assert.deepEqual([...u.respaldoHashes].sort(), respaldos.map(huellaRespaldo).sort());
    assert.equal(u.respaldoHashes.some((h) => respaldos.includes(h)), false);
    assert.equal(u.totpUltimoPaso > 0, true, "el código de la activación no sirve otra vez para entrar");
  });

  test("ya activo, no se puede volver a activar ni a pedir otro QR (nadie le cambia el secreto a la cuenta)", async () => {
    assert.equal((await iniciarActivacion(id)).ok, false);
    assert.equal((await confirmarActivacion(id, codigoTotp(secreto, pasoDe() + 1))).ok, false);
  });

  test("al entrar: el código de la aplicación sirve una vez; el mismo, otra vez, no; uno equivocado, tampoco", async () => {
    const u = await usuario();
    const siguiente = codigoTotp(secreto, u.totpUltimoPaso + 1); // dentro de la ventana de ±1
    assert.equal(await verificarSegundoFactor(u, "123456"), false);
    assert.equal(await verificarSegundoFactor(u, ""), false);
    assert.equal(await verificarSegundoFactor(u, siguiente), true);
    assert.equal(await verificarSegundoFactor(await usuario(), siguiente), false, "repetirlo no sirve");
    assert.equal(await verificarSegundoFactor(await usuario(), codigoTotp(secreto, u.totpUltimoPaso)), false, "uno anterior tampoco");
  });

  test("dos entradas a la vez con el mismo código: solo una pasa", async () => {
    await db.user.update({ where: { id }, data: { totpUltimoPaso: pasoDe() - 2 } }); // como si hubiera pasado un rato desde el último código
    const u = await usuario();
    const c = codigoTotp(secreto, pasoDe());
    const r = await Promise.all([verificarSegundoFactor(u, c), verificarSegundoFactor(u, c)]);
    assert.deepEqual(r.filter(Boolean).length, 1);
  });

  test("un código de respaldo sirve una sola vez (con o sin guion, en mayúsculas), y dos a la vez no lo aprovechan los dos", async () => {
    const [a, b, c] = respaldos as [string, string, string];
    const u = await usuario();
    assert.equal(await verificarSegundoFactor(u, a.toUpperCase()), true);
    assert.equal(await verificarSegundoFactor(await usuario(), a), false, "ya se gastó");
    assert.equal(await verificarSegundoFactor(await usuario(), b.replace("-", "")), true);
    const [x, y] = await Promise.all([verificarSegundoFactor(await usuario(), c), verificarSegundoFactor(await usuario(), c)]);
    assert.equal([x, y].filter(Boolean).length, 1);
    assert.equal((await usuario()).respaldoHashes.length, 5);
    assert.equal(await verificarSegundoFactor(u, "zzzzz-zzzzz"), false);
  });

  test("sin segundo factor activo, ningún código sirve", async () => {
    assert.equal(await verificarSegundoFactor({ id, totpSecreto: null, totpUltimoPaso: 0 }, codigoTotp(secreto, pasoDe())), false);
  });

  test("la lista de usuarios de Ajustes dice si está activo pero nunca lleva el secreto", async () => {
    const lista = await listarUsuarios();
    const fila = lista.find((x) => x.id === id)!;
    assert.equal(fila.segundoFactor, true);
    const texto = JSON.stringify(lista);
    for (const prohibido of ["totpSecreto", "totpPendiente", "respaldoHashes", (await usuario()).totpSecreto!]) assert.equal(texto.includes(prohibido), false, prohibido);
  });

  test("quitar el segundo factor: nadie se lo quita a sí mismo; otro administrador sí, y queda registrado", async () => {
    assert.equal((await quitarSegundoFactor(id, { id, nombre: "yo" })).ok, false);
    assert.equal((await quitarSegundoFactor("no-existe", { id: "otro", nombre: "Otro" })).ok, false);
    const r = await quitarSegundoFactor(id, { id: otroId, nombre: "Otro admin" });
    assert.equal(r.ok, true);
    const u = await usuario();
    assert.deepEqual([u.totpSecreto, u.totpPendiente, u.totpUltimoPaso, u.respaldoHashes], [null, null, 0, []]);
    assert.equal(await db.activityLog.count({ where: { accion: "quitar_segundo_factor", entidadId: id } }), 1);
    assert.equal((await quitarSegundoFactor(id, { id: otroId, nombre: "Otro admin" })).ok, true, "repetirlo no rompe nada");
    assert.equal(await db.activityLog.count({ where: { accion: "quitar_segundo_factor", entidadId: id } }), 1, "y no deja otra línea");
  });
});
