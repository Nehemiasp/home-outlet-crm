import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { explicacionMeta } from "@/lib/canales/whatsapp";
import { ErrorDeCanal } from "@/lib/canales/tipos";
import { registrarError } from "@/lib/registro";

// Cuando un envío falla, el registro tiene que decir por qué (el código del canal y qué significa) sin escribir datos del
// cliente. No usa base de datos.

describe("registro de errores", () => {
  const capturar = (fn: () => void) => {
    const lineas: string[] = [];
    const [warn, error] = [console.warn, console.error];
    console.warn = console.error = (l: string) => void lineas.push(l);
    try {
      fn();
    } finally {
      [console.warn, console.error] = [warn, error];
    }
    return lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
  };

  test("un error de canal se registra con su código y la explicación", () => {
    const [l] = capturar(() => registrarError("envío por whatsapp (mensaje m1)", new ErrorDeCanal("WhatsApp", 400, 10, explicacionMeta(10)), { nivel: "aviso" }));
    assert.equal(l!.nivel, "aviso");
    assert.equal(l!.contexto, "envío por whatsapp (mensaje m1)");
    assert.equal(l!.mensaje, "WhatsApp respondió 400 (código 10): el token no tiene permiso sobre esa cuenta o número");
  });

  test("un error cualquiera sigue sin escribir su texto (podría traer datos del cliente)", () => {
    const [l] = capturar(() => registrarError("algo", new Error("Teléfono 55551234 de Juan")));
    assert.equal(l!.tipo, "Error");
    assert.equal(l!.mensaje, undefined);
    assert.equal(JSON.stringify(l).includes("Juan"), false);
  });

  test("un código desconocido queda solo con el número", () => {
    assert.equal(new ErrorDeCanal("Facebook", 500, 999999, explicacionMeta(999999)).message, "Facebook respondió 500 (código 999999)");
    assert.equal(new ErrorDeCanal("TikTok", 502).message, "TikTok respondió 502");
  });
});
