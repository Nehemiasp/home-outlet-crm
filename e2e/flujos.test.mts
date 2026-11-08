// Pruebas de punta a punta con un navegador real (Edge o Chrome ya instalados; no se descarga nada).
// Recorren lo crítico: iniciar sesión, un mensaje de cliente que entra y responde el asistente, y crear → pagar → verificar un pedido.
//
//   1. npm run db y npm run dev (la aplicación en http://localhost:3000, o la dirección de E2E_URL)
//   2. npm run e2e
// Si las páginas se recargan sin parar (el servidor muestra «Compiled in 1ms» una y otra vez) es la caché de compilación dañada, que queda así
// cuando el servidor de desarrollo se mata de golpe: detenga el servidor, borre la carpeta .next y arránquelo de nuevo.
// E2E_CAPTURAS=<carpeta> guarda capturas del panel de crear pedido, de la página de pago y del detalle del pedido.
// El pago con tarjeta solo se prueba si la aplicación corre con PASARELA=simulada y se define E2E_PASARELA=1 al correr las pruebas.
//
// No usa los datos de demostración ni las contraseñas de nadie: crea su propio usuario, producto, ubicación y cuenta
// (todo con el prefijo PRUEBA-E2E), y al terminar lo borra y deja los ajustes de pedidos como estaban.
import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { db } from "@/lib/db";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";

const URL_BASE = process.env.E2E_URL ?? "http://localhost:3000";
const NAVEGADORES = [process.env.E2E_NAVEGADOR, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

const CORREO = "prueba-e2e@homeoutlet.test";
const CLAVE = randomBytes(12).toString("base64url");
const TELEFONO = "5550" + String(Math.floor(1000 + Math.random() * 8999)); // 8 dígitos
const NOMBRE_CLIENTE = "PRUEBA-E2E Cliente";

describe("flujos críticos (navegador real)", { timeout: 240_000 }, () => {
  let navegador: Browser;
  let contexto: BrowserContext;
  let agente: Page; // la persona de la tienda, en la bandeja
  let cliente: Page; // el «teléfono del cliente», en el simulador
  let originales: Awaited<ReturnType<typeof obtenerAjustesPedidos>>;
  let usuarioId: string;
  let ubicacionId: string;

  before(async () => {
    const respuesta = await fetch(`${URL_BASE}/api/salud`).catch(() => null);
    assert.ok(respuesta?.ok, `La aplicación no responde en ${URL_BASE}. Inicie «npm run db» y «npm run dev» (o defina E2E_URL).`);
    const ejecutable = NAVEGADORES.find((r) => r && existsSync(r));
    assert.ok(ejecutable, "No se encontró Edge ni Chrome. Defina E2E_NAVEGADOR con la ruta del ejecutable.");

    originales = await obtenerAjustesPedidos();
    usuarioId = (await db.user.upsert({ where: { correo: CORREO }, update: { passwordHash: await bcrypt.hash(CLAVE, 10), activo: true, rol: "admin" }, create: { correo: CORREO, nombre: "PRUEBA-E2E Admin", rol: "admin", passwordHash: await bcrypt.hash(CLAVE, 10) } })).id;
    ubicacionId = (await db.location.create({ data: { nombre: "PRUEBA-E2E Tienda" } })).id;
    const producto = await db.product.create({ data: { sku: "PRUEBA-E2E-1", nombre: "PRUEBA-E2E Licuadora", precio: 10_000 } });
    await db.stock.create({ data: { productoId: producto.id, ubicacionId, cantidad: 5 } });
    await db.bankAccount.create({ data: { banco: "PRUEBA-E2E Banco", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet" } });
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: "separado", ubicacionRecogerId: ubicacionId, ubicacionEnvioId: ubicacionId, prefijo: "E2E-", siguienteNumero: 1, horasReserva: 24, descuentoMaxAgente: 0, envioGratisDesde: null, metodos: ["transferencia", "deposito", "tarjeta"] } });

    navegador = await chromium.launch({ executablePath: ejecutable, headless: true });
    contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-GT", timezoneId: "America/Guatemala" });
    agente = await contexto.newPage();
    cliente = await contexto.newPage();
  });

  after(async () => {
    await navegador?.close();
    await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { inventario: originales.inventario, ubicacionRecogerId: originales.ubicacionRecogerId, ubicacionEnvioId: originales.ubicacionEnvioId, descuentoMaxAgente: originales.descuentoMaxAgente, envioGratisDesde: originales.envioGratisDesde, horasReserva: originales.horasReserva, prefijo: originales.prefijo, siguienteNumero: originales.siguienteNumero, metodos: originales.metodos } });
    const contactos = await db.contact.findMany({ where: { nombre: NOMBRE_CLIENTE }, select: { id: true } });
    const ids = contactos.map((c) => c.id);
    await db.order.deleteMany({ where: { contactoId: { in: ids } } });
    await db.conversation.deleteMany({ where: { contactoId: { in: ids } } });
    await db.contact.deleteMany({ where: { id: { in: ids } } });
    await db.product.deleteMany({ where: { sku: "PRUEBA-E2E-1" } });
    await db.location.deleteMany({ where: { nombre: "PRUEBA-E2E Tienda" } });
    await db.bankAccount.deleteMany({ where: { banco: "PRUEBA-E2E Banco" } });
    await db.activityLog.deleteMany({ where: { usuarioId } });
    await db.user.deleteMany({ where: { id: usuarioId } });
    await db.$disconnect();
  });

  const entrar = async (p: Page, clave = CLAVE) => {
    await p.goto(`${URL_BASE}/login`, { waitUntil: "networkidle" }); // con el servidor recién iniciado, enviar antes de que cargue el JavaScript recarga la página en vez de entrar
    await p.getByLabel("Correo").fill(CORREO);
    await p.getByLabel("Contraseña").fill(clave);
    await p.getByRole("button", { name: "Entrar" }).click();
  };

  it("rechaza una contraseña incorrecta y deja entrar con la correcta", async () => {
    await entrar(agente, "clave-equivocada");
    await agente.getByText("El correo o la contraseña no son correctos.").waitFor();
    assert.match(agente.url(), /\/login/);

    await entrar(agente);
    await agente.waitForURL("**/bandeja**");
    await agente.getByRole("heading", { name: "Bandeja" }).waitFor();
    assert.equal(await db.intentoTasa.count({ where: { clave: `correo:${CORREO}` } }), 0, "entrar bien limpia los fallos del correo");

    // el simulador comparte la sesión (mismo navegador), pero necesita su propia página
    await cliente.goto(`${URL_BASE}/simulador`);
    await cliente.getByRole("heading", { name: "Simulador" }).waitFor();
  });

  it("un mensaje del cliente entra por el simulador, responde el asistente y aparece en la bandeja", async () => {
    await cliente.getByLabel("Nombre del contacto nuevo").fill(NOMBRE_CLIENTE);
    await cliente.getByLabel("Teléfono", { exact: true }).fill(TELEFONO);
    await cliente.getByLabel("Mensaje del cliente").fill("Hola, ¿cuánto cuesta la licuadora?");
    await cliente.getByRole("button", { name: "Enviar mensaje" }).click();
    // el asistente (simulado) contesta solo
    await cliente.getByRole("log").getByText("Equipo", { exact: false }).first().waitFor({ timeout: 30_000 });

    await agente.goto(`${URL_BASE}/bandeja`);
    await agente.getByRole("tab", { name: "Todas" }).click();
    await agente.getByRole("button", { name: new RegExp(`^${NOMBRE_CLIENTE}`) }).first().click();
    await agente.getByText("Hola, ¿cuánto cuesta la licuadora?").first().waitFor();
  });

  it("crear y enviar un pedido desde la conversación", async () => {
    await agente.getByRole("button", { name: "Crear pedido" }).click();
    const panel = agente.getByRole("dialog", { name: "Crear pedido" });
    await panel.getByLabel("Buscar en el catálogo").fill("PRUEBA-E2E");
    await panel.getByRole("button", { name: "Agregar PRUEBA-E2E Licuadora" }).click();
    assert.equal(await panel.getByRole("button", { name: "Enviar al cliente" }).isDisabled(), true, "sin forma de pago no se puede enviar");
    await panel.getByRole("radio", { name: "Transferencia bancaria" }).check();
    await panel.getByRole("button", { name: "Enviar al cliente" }).click();
    await agente.getByText(/Pedido E2E-000001/).first().waitFor({ timeout: 15_000 });
  });

  it("el cliente manda un comprobante y la persona lo registra", async () => {
    await cliente.getByRole("button", { name: "Enviar comprobante de ejemplo" }).click();
    await cliente.getByRole("log").getByRole("img").first().waitFor({ timeout: 15_000 });
    await agente.reload();
    await agente.getByRole("button", { name: "Registrar como comprobante" }).first().click();
    const dialogo = agente.getByRole("dialog", { name: "Registrar como comprobante" });
    await dialogo.getByRole("combobox", { name: "Banco" }).fill("PRUEBA-E2E Banco");
    await dialogo.getByLabel("Referencia o número de boleta").fill("E2E-" + Date.now());
    await dialogo.getByLabel("Monto (Q)").fill("100");
    await dialogo.getByRole("button", { name: "Registrar comprobante" }).click();
    await agente.getByText("En revisión").first().waitFor({ timeout: 15_000 });
  });

  it("la persona verifica el pago y el pedido queda pagado con la existencia descontada", async () => {
    await agente.getByRole("link", { name: "Ver pedido" }).first().click();
    await agente.waitForURL("**/pedidos/**");
    await agente.getByRole("heading", { name: "E2E-000001" }).waitFor();
    const producto = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-E2E-1" } });
    const existencia = () => db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId: producto.id, ubicacionId } } });
    assert.deepEqual({ cantidad: (await existencia()).cantidad, apartado: (await existencia()).apartado }, { cantidad: 5, apartado: 1 }, "enviar el pedido aparta 1 unidad");

    await agente.getByRole("button", { name: "Verificar", exact: true }).click();
    await agente.getByRole("dialog", { name: "Verificar pago" }).getByRole("button", { name: "Aprobar" }).click();
    const estado = async () => (await db.order.findFirstOrThrow({ where: { codigo: "E2E-000001" }, select: { estado: true } })).estado;
    for (let i = 0; i < 30 && (await estado()) !== "pagado"; i++) await new Promise((f) => setTimeout(f, 500)); // el servidor tarda un momento en responder
    assert.equal(await estado(), "pagado");
    const despues = await existencia();
    assert.deepEqual({ cantidad: despues.cantidad, apartado: despues.apartado }, { cantidad: 4, apartado: 0 }, "pagar descuenta la unidad y libera lo apartado");
  });

  it("pago con tarjeta con la pasarela simulada: enlace, pago del cliente y pedido pagado", { skip: !process.env.E2E_PASARELA && "defina E2E_PASARELA=1 y arranque la aplicación con PASARELA=simulada" }, async () => {
    await agente.goto(`${URL_BASE}/bandeja`);
    await agente.getByRole("tab", { name: "Todas" }).click();
    await agente.getByRole("button", { name: new RegExp(`^${NOMBRE_CLIENTE}`) }).first().click();
    await agente.getByRole("button", { name: "Crear pedido" }).click();
    const panel = agente.getByRole("dialog", { name: "Crear pedido" });
    await panel.getByLabel("Buscar en el catálogo").fill("PRUEBA-E2E");
    await panel.getByRole("button", { name: "Agregar PRUEBA-E2E Licuadora" }).click();
    await panel.getByRole("radio", { name: "Tarjeta de crédito o débito" }).check();
    if (process.env.E2E_CAPTURAS) await agente.screenshot({ path: `${process.env.E2E_CAPTURAS}/panel-forma-pago.png` });
    await panel.getByRole("button", { name: "Enviar al cliente" }).click();
    await agente.getByText(/Pedido E2E-000002/).first().waitFor({ timeout: 15_000 });
    await agente.getByText("Pago con tarjeta").first().waitFor(); // la tarjeta del pedido en el chat: sin cuentas bancarias, con el enlace
    assert.equal(await agente.getByText("Cuentas para pagar").count(), 1, "solo la del pedido 1 (transferencia) lleva cuentas");
    if (process.env.E2E_CAPTURAS) {
      await agente.getByRole("log").evaluate((el) => el.scrollTo(0, el.scrollHeight)); // al final, donde está la tarjeta del pedido nuevo
      await agente.screenshot({ path: `${process.env.E2E_CAPTURAS}/chat-tarjeta.png` });
    }
    const pedido = await db.order.findFirstOrThrow({ where: { codigo: "E2E-000002" } });
    assert.equal(pedido.metodoPago, "tarjeta");
    await agente.goto(`${URL_BASE}/pedidos/${pedido.id}`); // directo: en la conversación hay un «Ver pedido» por cada pedido y el orden de los enlaces no es lo que se prueba aquí
    await agente.getByRole("heading", { name: "E2E-000002" }).waitFor();
    await agente.getByText("Tarjeta de crédito o débito").first().waitFor(); // «Forma de pago» en el detalle
    await agente.getByText(/esperando el pago del cliente/).waitFor({ timeout: 15_000 }); // el enlace salió con el resumen, sin botón aparte

    const cobro = await db.cobroTarjeta.findFirstOrThrow({ where: { pedidoId: pedido.id } });
    assert.equal(cobro.estado, "creado");
    // el cliente abre el enlace y paga en la página de la pasarela (aquí simulada)
    await cliente.goto(`${URL_BASE}/pagar/${cobro.externoId}`, { waitUntil: "networkidle" });
    await cliente.getByText("no se cobra nada").waitFor();
    if (process.env.E2E_CAPTURAS) {
      await cliente.screenshot({ path: `${process.env.E2E_CAPTURAS}/pagar.png` }); // para revisar el diseño a ojo
      await agente.screenshot({ path: `${process.env.E2E_CAPTURAS}/pedido-con-enlace.png` });
    }
    await cliente.getByRole("button", { name: "Pagar con la tarjeta de prueba" }).click();
    await cliente.getByText(/Pago realizado/).waitFor({ timeout: 15_000 });

    const estado = async () => (await db.order.findUniqueOrThrow({ where: { id: pedido.id } })).estado;
    for (let i = 0; i < 30 && (await estado()) !== "pagado"; i++) await new Promise((f) => setTimeout(f, 500));
    assert.equal(await estado(), "pagado");
    const pago = await db.payment.findFirstOrThrow({ where: { pedidoId: pedido.id } });
    assert.deepEqual({ tipo: pago.tipo, estado: pago.estado, monto: pago.monto }, { tipo: "tarjeta", estado: "verificado", monto: 10_000 });
    const producto = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-E2E-1" } });
    const s = await db.stock.findUniqueOrThrow({ where: { productoId_ubicacionId: { productoId: producto.id, ubicacionId } } });
    assert.deepEqual({ cantidad: s.cantidad, apartado: s.apartado }, { cantidad: 3, apartado: 0 });
  });
});
