import "dotenv/config";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { adaptadorWhatsApp, olvidarPlantillas } from "@/lib/canales/whatsapp";
import { armarCuerpo, contarVariables } from "@/lib/canales/plantillas-canal";
import { db } from "@/lib/db";
import { enviarMensaje } from "@/lib/mensajeria";

// Plantillas de canal: lo único que se puede enviar con la ventana de 24 horas cerrada. Meta se simula cambiando fetch.

describe("texto de las plantillas", () => {
  test("cuenta las variables y arma el mensaje; la que falta queda a la vista", () => {
    assert.equal(contarVariables("Hola {{1}}, su pedido {{2}} está listo."), 2);
    assert.equal(contarVariables("Sin variables"), 0);
    assert.equal(armarCuerpo("Hola {{1}}, su pedido {{2}} está listo.", ["Ana", "HO-000123"]), "Hola Ana, su pedido HO-000123 está listo.");
    assert.equal(armarCuerpo("Hola {{1}}, su pedido {{2}}.", ["Ana", "  "]), "Hola Ana, su pedido {{2}}.");
    assert.equal(armarCuerpo("{{1}} y {{1}}", ["Ana"]), "Ana y Ana");
  });
});

describe("plantillas de WhatsApp (Meta simulado)", () => {
  const previo = { t: process.env.WHATSAPP_TOKEN, p: process.env.WHATSAPP_PHONE_NUMBER_ID, w: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID };
  const fetchReal = globalThis.fetch;
  let llamadas: { url: string; init: RequestInit }[] = [];
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const simular = (r: (u: string) => Response) => {
    llamadas = [];
    globalThis.fetch = (async (u: string | URL, init: RequestInit = {}) => (llamadas.push({ url: String(u), init }), r(String(u)))) as typeof fetch;
  };

  const PLANTILLAS = {
    data: [
      { name: "pedido_listo", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hola {{1}}, su pedido {{2}} ya está listo." }, { type: "FOOTER", text: "Home Outlet" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY" }, { type: "URL", url: "https://homeoutlet.example/tienda" }] }] },
      { name: "saludo", language: "es", status: "APPROVED", category: "MARKETING", components: [{ type: "HEADER", format: "TEXT", text: "Hola" }, { type: "BODY", text: "Gracias por escribirnos." }] },
      { name: "en_revision", language: "es", status: "PENDING", category: "UTILITY", components: [{ type: "BODY", text: "Texto." }] },
      { name: "codigo", language: "es", status: "APPROVED", category: "AUTHENTICATION", components: [{ type: "BODY", text: "Su código es {{1}}." }] },
      { name: "con_foto", language: "es", status: "APPROVED", category: "MARKETING", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Mire." }] },
      { name: "con_nombre", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hola {{cliente}}." }] },
      { name: "carrusel", language: "es", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Mire nuestras ofertas." }, { type: "CAROUSEL" }] },
      { name: "boton_variable", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Mire." }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://homeoutlet.example/{{1}}" }] }] },
    ],
  };

  before(() => {
    process.env.WHATSAPP_TOKEN = "token-de-prueba";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1111222233";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "9998887776";
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
    olvidarPlantillas();
  });
  after(() => {
    for (const [k, v] of [["WHATSAPP_TOKEN", previo.t], ["WHATSAPP_PHONE_NUMBER_ID", previo.p], ["WHATSAPP_BUSINESS_ACCOUNT_ID", previo.w]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
  });

  test("solo ofrece las aprobadas que el sistema sabe llenar, con el pie y el encabezado en el texto", async () => {
    simular(() => json(PLANTILLAS));
    const lista = await adaptadorWhatsApp.listTemplates!();
    assert.deepEqual(lista.map((p) => [p.nombre, p.variables, p.categoria]), [["pedido_listo", 2, "UTILITY"], ["saludo", 0, "MARKETING"]]);
    assert.equal(lista[0]!.cuerpo, "Hola {{1}}, su pedido {{2}} ya está listo.\n\nHome Outlet");
    assert.equal(lista[1]!.cuerpo, "Hola\n\nGracias por escribirnos.");
    assert.match(llamadas[0]!.url, /\/9998887776\/message_templates\?/);
    assert.equal((llamadas[0]!.init.headers as Record<string, string>).Authorization, "Bearer token-de-prueba");
  });

  test("la lista se guarda un minuto: pedirla otra vez no vuelve a llamar a Meta", async () => {
    simular(() => json(PLANTILLAS));
    await adaptadorWhatsApp.listTemplates!();
    await adaptadorWhatsApp.listTemplates!();
    assert.equal(llamadas.length, 1);
  });

  test("sin el identificador de la cuenta de WhatsApp, o si Meta falla, da error claro y sin secretos", async () => {
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    await assert.rejects(adaptadorWhatsApp.listTemplates!(), /WHATSAPP_BUSINESS_ACCOUNT_ID/);
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "9998887776";
    simular(() => json({ error: { code: 190 } }, 401));
    await assert.rejects(adaptadorWhatsApp.listTemplates!(), (e: Error) => /401.*190/.test(e.message) && !e.message.includes("token-de-prueba"));
  });

  test("enviar una plantilla manda nombre, idioma y las variables del cuerpo, al número sin «+»", async () => {
    simular(() => json({ messages: [{ id: "wamid.plantilla" }] }));
    const r = await adaptadorWhatsApp.send("+50240432655", { type: "template", text: "Hola Ana, su pedido HO-1 ya está listo.", template: { nombre: "pedido_listo", idioma: "es", parametros: ["Ana", "HO-1"] } });
    assert.deepEqual(r, { externalMessageId: "wamid.plantilla" });
    assert.equal(llamadas[0]!.url, "https://graph.facebook.com/v25.0/1111222233/messages");
    assert.deepEqual(JSON.parse(String(llamadas[0]!.init.body)), {
      messaging_product: "whatsapp",
      to: "50240432655",
      type: "template",
      template: { name: "pedido_listo", language: { code: "es" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "HO-1" }] }] },
    });
    // Sin variables no se manda la sección de componentes.
    simular(() => json({ messages: [{ id: "wamid.2" }] }));
    await adaptadorWhatsApp.send("50240432655", { type: "template", template: { nombre: "saludo", idioma: "es", parametros: [] } });
    assert.deepEqual(JSON.parse(String(llamadas[0]!.init.body)).template, { name: "saludo", language: { code: "es" } });
    await assert.rejects(adaptadorWhatsApp.send("50240432655", { type: "template" }), /plantilla/);
  });
});

describe("enviar una plantilla con la ventana cerrada (con base de datos)", () => {
  const PREFIJO = "PRUEBA-PL";
  let conversacionId = "";
  let antes: string | undefined;

  before(async () => {
    antes = process.env.CHANNELS_ENABLED;
    process.env.CHANNELS_ENABLED = "simulado";
    const contacto = await db.contact.create({ data: { nombre: `${PREFIJO} cliente`, telefono: "+50250991234", identidades: { create: { canal: "simulado", externalContactId: "+50250991234" } } } });
    const hace30h = new Date(Date.now() - 30 * 3_600_000);
    const c = await db.conversation.create({ data: { contactoId: contacto.id, canal: "simulado", lastMessageAt: hace30h, lastInboundAt: hace30h } });
    conversacionId = c.id;
  });
  after(async () => {
    antes === undefined ? delete process.env.CHANNELS_ENABLED : (process.env.CHANNELS_ENABLED = antes);
    const contactos = await db.contact.findMany({ where: { nombre: { startsWith: PREFIJO } }, select: { id: true } });
    await db.conversation.deleteMany({ where: { contactoId: { in: contactos.map((c) => c.id) } } });
    await db.contact.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await db.$disconnect();
  });

  test("el texto libre se rechaza, la plantilla sale y queda guardada con su texto armado", async () => {
    const libre = await enviarMensaje({ conversacionId, mensaje: { type: "text", text: "Hola, ¿sigue interesado?" } });
    assert.equal(libre.ok, false);
    assert.match((libre as { error: string }).error, /24 horas/);

    const r = await enviarMensaje({ conversacionId, usuarioId: undefined, mensaje: { type: "template", text: "Hola Ana, ¿pudo revisar la cotización?", template: { nombre: "seguimiento_cotizacion", idioma: "es", parametros: ["Ana"] } } });
    assert.equal(r.ok, true);
    const m = await db.message.findUniqueOrThrow({ where: { id: (r as { mensajeId: string }).mensajeId } });
    assert.deepEqual([m.direccion, m.tipo, m.texto, m.estado], ["saliente", "text", "Hola Ana, ¿pudo revisar la cotización?", "enviado"]);
    assert.ok(m.externalMessageId);
  });
});
