import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revisarEntorno } from "@/lib/entorno";

const bueno = {
  AUTH_SECRET: "x7Qm2LkP9vTr4WnB8cJd5HsY1aZe6UoF3gKi0NtV",
  DATABASE_URL: "postgresql://app:Clave-larga-propia@bd.interna:5432/homeoutlet",
  CHANNELS_ENABLED: "whatsapp",
  WHATSAPP_TOKEN: "t",
  WHATSAPP_PHONE_NUMBER_ID: "1",
  WHATSAPP_APP_SECRET: "s",
  WHATSAPP_VERIFY_TOKEN: "v",
  AI_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "k",
  TAREAS_SECRET: "un-secreto-de-mas-de-24-caracteres",
  PROXIES_CONFIABLES: "1",
  UPLOADS_DIR: "/data/uploads",
  RESPALDO_AUTOMATICO: "1",
  AUTH_TRUST_HOST: "true",
};

describe("revisión del entorno de producción", () => {
  it("una configuración completa no da errores ni avisos", () => {
    assert.deepEqual(revisarEntorno(bueno), { errores: [], avisos: [] });
  });

  it("se niega con un AUTH_SECRET ausente, corto o de ejemplo", () => {
    for (const AUTH_SECRET of [undefined, "corto", "(genere uno con: npx auth secret) y algo más de 32"]) assert.equal(revisarEntorno({ ...bueno, AUTH_SECRET }).errores.length, 1);
  });

  it("se niega con la clave de base de datos de desarrollo, salvo que se permita para probar en local", () => {
    const dev = { ...bueno, DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/homeoutlet" };
    assert.equal(revisarEntorno(dev).errores.length, 1);
    assert.equal(revisarEntorno({ ...dev, PERMITIR_CLAVE_DE_DESARROLLO: "1" }).errores.length, 0);
    assert.equal(revisarEntorno({ ...bueno, DATABASE_URL: undefined }).errores.length, 1);
  });

  it("WhatsApp a medias es un error que nombra lo que falta", () => {
    const r = revisarEntorno({ ...bueno, WHATSAPP_APP_SECRET: "", WHATSAPP_VERIFY_TOKEN: undefined });
    assert.equal(r.errores.length, 1);
    assert.match(r.errores[0]!, /WHATSAPP_APP_SECRET.*WHATSAPP_VERIFY_TOKEN/);
  });

  it("Facebook e Instagram, igual que WhatsApp, no pueden quedar activados a medias", () => {
    const r = revisarEntorno({ ...bueno, CHANNELS_ENABLED: "whatsapp,facebook,instagram", INSTAGRAM_TOKEN: "t", INSTAGRAM_ACCOUNT_ID: "1" });
    assert.equal(r.errores.length, 2);
    assert.match(r.errores[0]!, /Facebook.*FACEBOOK_PAGE_TOKEN/);
    assert.match(r.errores[1]!, /Instagram.*INSTAGRAM_APP_SECRET.*INSTAGRAM_VERIFY_TOKEN/);
  });

  it("la pasarela simulada no se acepta en producción", () => {
    const r = revisarEntorno({ ...bueno, PASARELA: "simulada" });
    assert.equal(r.errores.length, 1);
    assert.match(r.errores[0]!, /PASARELA=simulada/);
    assert.equal(revisarEntorno({ ...bueno, PASARELA: undefined }).errores.length, 0);
  });

  it("Claude sin clave es un error; el asistente simulado solo avisa", () => {
    assert.equal(revisarEntorno({ ...bueno, ANTHROPIC_API_KEY: "" }).errores.length, 1);
    const r = revisarEntorno({ ...bueno, AI_PROVIDER: undefined, ANTHROPIC_API_KEY: undefined });
    assert.equal(r.errores.length, 0);
    assert.equal(r.avisos.length, 1);
  });

  it("avisa de la IP sin proxy, del canal simulado, de las fotos sin volumen y del respaldo apagado", () => {
    const r = revisarEntorno({ ...bueno, PROXIES_CONFIABLES: undefined, AUTH_TRUST_HOST: undefined, CHANNELS_ENABLED: "simulado,whatsapp", UPLOADS_DIR: undefined, RESPALDO_AUTOMATICO: undefined });
    assert.equal(r.errores.length, 0);
    assert.equal(r.avisos.length, 5);
    assert.ok(r.avisos.some((a) => /UPLOADS_DIR/.test(a)) && r.avisos.some((a) => /RESPALDO_AUTOMATICO/.test(a)));
  });

  it("un TAREAS_SECRET vacío ya no es un aviso (las tareas corren dentro del servidor), pero uno corto sí", () => {
    assert.equal(revisarEntorno({ ...bueno, TAREAS_SECRET: "" }).avisos.length, 0);
    assert.equal(revisarEntorno({ ...bueno, TAREAS_SECRET: "corto" }).avisos.length, 1);
  });
});
