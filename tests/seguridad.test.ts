import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import robots from "@/app/robots";
import { adaptadorSimulado } from "@/lib/canales/simulado";
import { huellaDeClave, sesionVigente } from "@/lib/sesion-vigente";

// Guardias contra olvidos de seguridad: lo que nadie debería poder dejar abierto sin darse cuenta.

describe("la sesión muere cuando se restablece la contraseña", () => {
  const hash = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
  const u = { activo: true, passwordHash: hash };

  test("la huella no revela el hash, es estable y cambia con él", () => {
    const h = huellaDeClave(hash);
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.equal(huellaDeClave(hash), h);
    assert.notEqual(huellaDeClave(`${hash}x`), h);
    assert.equal(hash.includes(h), false);
  });

  test("vale con la clave de hoy; no vale con la de ayer, sin huella, ni con el usuario inactivo o borrado", () => {
    assert.equal(sesionVigente(u, huellaDeClave(hash)), true);
    assert.equal(sesionVigente({ ...u, passwordHash: `${hash}nueva` }, huellaDeClave(hash)), false, "clave restablecida");
    assert.equal(sesionVigente(u, undefined), false, "sesión anterior a este control");
    assert.equal(sesionVigente(u, ""), false);
    assert.equal(sesionVigente({ ...u, activo: false }, huellaDeClave(hash)), false);
    assert.equal(sesionVigente(null, huellaDeClave(hash)), false);
  });
});

describe("el sistema es privado", () => {
  test("se le pide a los buscadores que no lo recorran", () => {
    assert.deepEqual(robots(), { rules: { userAgent: "*", disallow: "/" } });
    assert.match(readFileSync("app/layout.tsx", "utf8"), /robots: \{ index: false, follow: false \}/);
  });

  test("el canal simulado no recibe nada en producción, ni siquiera sin firma", async () => {
    const antes = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      assert.equal(await adaptadorSimulado.verifyWebhook(new Request("http://x/api/webhooks/simulado", { method: "POST", body: "{}" })), false);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = antes!;
    }
  });
});

describe("cada acción del servidor revisa quién la pide", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const ruta = path.join(dir, n);
      if (statSync(ruta).isDirectory()) return n === "node_modules" || n === ".next" ? [] : archivos(ruta);
      return /\.(ts|tsx)$/.test(n) ? [ruta] : [];
    });
  const GUARDIA = /require(Usuario|ConBodega|Permiso|SesionParcial)\(|getUsuario\(|soloAdminEnDesarrollo\(|notFound\(\)/;
  // Las únicas acciones que no piden sesión, y por qué: entrar y salir son el propio inicio de sesión, y el cobro simulado
  // se cierra solo (con otra pasarela o en producción responde «No existe»).
  const SIN_SESION = new Set(["app/login/actions.ts::entrar", "app/login/actions.ts::salir", "app/pagar/[id]/actions.ts::resolverCobroSimulado"]);

  test("toda acción exportada de un archivo «use server» llama a una guardia (directa o por una función local), salvo las permitidas", () => {
    const fuentes = ["app", "lib"].flatMap((d) => archivos(d)).map((f) => f.split(path.sep).join("/")).filter((f) => /"use server"/.test(readFileSync(f, "utf8").slice(0, 80)));
    assert.ok(fuentes.length >= 10, `solo se encontraron ${fuentes.length} archivos de acciones`);
    const sinGuardia: string[] = [];
    let total = 0;
    for (const f of fuentes) {
      const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      const locales = [...s.matchAll(/^(?:async )?function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/gm)].filter((m) => GUARDIA.test(m[2]!)).map((m) => m[1]!);
      for (const t of s.split(/^export async function /m).slice(1)) {
        total++;
        const nombre = t.slice(0, t.indexOf("("));
        const fin = t.search(/\n\}\n/);
        const cuerpo = fin === -1 ? t : t.slice(0, fin + 3);
        const ok = GUARDIA.test(cuerpo) || locales.some((h) => new RegExp(`\\b${h}\\(`).test(cuerpo));
        if (!ok && !SIN_SESION.has(`${f}::${nombre}`)) sinGuardia.push(`${f}::${nombre}`);
      }
    }
    assert.ok(total >= 60, `solo se revisaron ${total} acciones`);
    assert.deepEqual(sinGuardia, [], "estas acciones no revisan la sesión: agregue requireUsuario/requirePermiso");
  });

  test("las rutas de la API que no son webhooks piden sesión o un secreto", () => {
    const rutas = archivos("app/api").map((f) => f.split(path.sep).join("/")).filter((f) => f.endsWith("route.ts"));
    // salud: pública y sin datos; webhooks y pagos/webhook: verifican la firma del proveedor; tareas: secreto; el resto: sesión.
    const PUBLICAS = new Set(["app/api/salud/route.ts", "app/api/webhooks/[canal]/route.ts", "app/api/pagos/webhook/route.ts", "app/api/auth/[...nextauth]/route.ts"]);
    const sinProteccion = rutas.filter((f) => !PUBLICAS.has(f) && !/getUsuario\(|TAREAS_SECRET|apiSimulada\(/.test(readFileSync(f, "utf8")));
    assert.deepEqual(sinProteccion, []);
  });
});
