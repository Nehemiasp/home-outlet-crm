import "dotenv/config";
import assert from "node:assert/strict";
import { setTimeout as esperar } from "node:timers/promises";
import { after, describe, test } from "node:test";
import { cargarConversacion, listarConversaciones } from "@/lib/bandeja";
import { db } from "@/lib/db";
import { enviarMensaje, recibirMensaje, reintentarMensaje } from "@/lib/mensajeria";
import { puedeAsignar, puedeCerrar, puedeGestionarProductos, puedeUnirContactos, puedeVerAjustes } from "@/lib/permisos";

const admin = { id: "a", rol: "admin" as const };
const agente = { id: "g", rol: "agente" as const };
const otro = { id: "o", rol: "agente" as const };

describe("permisos", () => {
  test("asignar: el admin a cualquiera; el agente solo a sí mismo y si está libre o ya es suya", () => {
    assert.equal(puedeAsignar(admin, { asignadaAId: "o" }, "g"), true);
    assert.equal(puedeAsignar(admin, { asignadaAId: "o" }, null), true);
    assert.equal(puedeAsignar(agente, { asignadaAId: null }, "g"), true);
    assert.equal(puedeAsignar(agente, { asignadaAId: "g" }, "g"), true);
    assert.equal(puedeAsignar(agente, { asignadaAId: null }, "o"), false); // a otro
    assert.equal(puedeAsignar(agente, { asignadaAId: "o" }, "g"), false); // quitársela a otro agente
    assert.equal(puedeAsignar(agente, { asignadaAId: "g" }, null), false); // soltarla
  });
  test("cerrar: el admin cualquiera; el agente solo las suyas", () => {
    assert.equal(puedeCerrar(admin, { asignadaAId: "o" }), true);
    assert.equal(puedeCerrar(agente, { asignadaAId: "g" }), true);
    assert.equal(puedeCerrar(agente, { asignadaAId: "o" }), false);
    assert.equal(puedeCerrar(otro, { asignadaAId: null }), false);
  });
  test("unir contactos, productos y ajustes son del admin", () => {
    for (const f of [puedeUnirContactos, puedeGestionarProductos, puedeVerAjustes]) {
      assert.equal(f(admin), true);
      assert.equal(f(agente), false);
    }
  });
});

// Flujo de punta a punta a nivel de servicio (necesita la base: npm run db). Limpia lo que crea.
describe("flujo completo: cliente escribe, el agente responde con un producto, el estado llega a leído", () => {
  const tel = "+50255559998";
  after(async () => {
    await db.contact.deleteMany({ where: { telefono: tel } });
    await db.user.deleteMany({ where: { correo: "flujo-prueba@homeoutlet.test" } });
    await db.product.deleteMany({ where: { sku: "TEST-FLUJO" } });
    await db.$disconnect();
  });

  test("simulador → bandeja → producto → leído", { timeout: 20_000 }, async () => {
    process.env.CHANNELS_ENABLED = "simulado";
    const usuario = await db.user.create({ data: { nombre: "Agente del flujo", correo: "flujo-prueba@homeoutlet.test", passwordHash: "x", rol: "agente" } });
    const producto = await db.product.create({ data: { sku: "TEST-FLUJO", nombre: "Producto del flujo", precio: 12500 } });

    // 1. El cliente escribe desde el simulador
    const entrada = await recibirMensaje({ channel: "simulado", externalContactId: tel, contactName: "Cliente del flujo", externalMessageId: `flujo-${Date.now()}`, type: "text", text: "¿Tienen todavía la pantalla para carro?", timestamp: new Date() });
    assert.ok(entrada.conversacionId);

    // 2. Aparece en la bandeja, sin asignar y con un mensaje sin leer
    const lista = await listarConversaciones({ tab: "sin-asignar", atencion: "todas", estado: "todos", canal: "simulado", asesor: "todos", q: "pantalla para carro", limite: 30 }, { id: usuario.id, rol: "admin" });
    const fila = lista.items.find((i) => i.id === entrada.conversacionId);
    assert.ok(fila, "la conversación debe aparecer al buscar por texto");
    assert.equal(fila.noLeidos, 1);

    // 3. El agente responde con un producto
    const envio = await enviarMensaje({ conversacionId: entrada.conversacionId!, usuarioId: usuario.id, mensaje: { type: "product", productId: producto.id } });
    assert.equal(envio.ok, true);

    // 4. El adaptador simulado confirma "entregado" y luego "leído"
    await esperar(3200);
    const dto = await cargarConversacion(entrada.conversacionId!, { id: usuario.id, rol: "admin" });
    const saliente = dto!.linea.find((m) => m.clase === "mensaje" && !m.entrante);
    assert.ok(saliente && saliente.clase === "mensaje");
    assert.equal(saliente.estado, "leido");
    assert.equal(saliente.producto?.nombre, "Producto del flujo");
    assert.equal(dto!.contacto.nombre, "Cliente del flujo");

    // Abrir la conversación la marcó como leída
    const despues = await listarConversaciones({ tab: "todas", atencion: "todas", estado: "todos", canal: "todos", asesor: "todos", q: "Cliente del flujo", limite: 30 }, { id: usuario.id, rol: "admin" });
    assert.equal(despues.items[0]?.noLeidos, 0);
  });

  test("un envío que falla queda en fallo y el reintento lo envía", { timeout: 10_000 }, async () => {
    process.env.CHANNELS_ENABLED = "simulado";
    const usuario = await db.user.findUniqueOrThrow({ where: { correo: "flujo-prueba@homeoutlet.test" } });
    const conv = await db.conversation.findFirstOrThrow({ where: { contacto: { telefono: tel } } });

    const primero = await enviarMensaje({ conversacionId: conv.id, usuarioId: usuario.id, mensaje: { type: "text", text: "/fallar" } });
    assert.equal(primero.ok, false);
    assert.ok(!primero.ok && primero.mensajeId);
    assert.equal((await db.message.findUniqueOrThrow({ where: { id: primero.mensajeId } })).estado, "fallo");

    const segundo = await reintentarMensaje(primero.mensajeId);
    assert.equal(segundo.ok, true);
    assert.equal((await db.message.findUniqueOrThrow({ where: { id: primero.mensajeId } })).estado, "enviado");
  });

  test("no se puede responder pasadas las 24 horas", async () => {
    process.env.CHANNELS_ENABLED = "simulado";
    const usuario = await db.user.findUniqueOrThrow({ where: { correo: "flujo-prueba@homeoutlet.test" } });
    const conv = await db.conversation.findFirstOrThrow({ where: { contacto: { telefono: tel } } });
    await db.conversation.update({ where: { id: conv.id }, data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) } });
    const r = await enviarMensaje({ conversacionId: conv.id, usuarioId: usuario.id, mensaje: { type: "text", text: "Hola" } });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /24 horas/);
  });
});
