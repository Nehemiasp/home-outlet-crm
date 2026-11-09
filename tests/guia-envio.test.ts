import "dotenv/config";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { extensionDeGuia, revisarGuia } from "@/lib/almacenamiento";
import { db } from "@/lib/db";
import { marcarEnviado } from "@/lib/pedidos/gestion";
import type { Canal } from "@/generated/prisma/client";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-GUIA y se borra al final, con los archivos subidos.

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const PDF = Buffer.from("%PDF-1.4\n%prueba de guía\n");
const archivo = (datos: Buffer, nombre: string) => new File([new Uint8Array(datos)], nombre);

describe("archivo de la guía", () => {
  test("se reconoce por su contenido: foto o PDF; lo demás no", () => {
    assert.equal(extensionDeGuia(PNG), "png");
    assert.equal(extensionDeGuia(PDF), "pdf");
    assert.equal(extensionDeGuia(Buffer.from("hola, esto es texto")), null);
  });

  test("sin archivo, vacío, de más de 5 MB o que no es foto ni PDF, se rechaza; el nombre se limpia", async () => {
    assert.equal((await revisarGuia(null)).ok, false);
    assert.equal((await revisarGuia(archivo(Buffer.alloc(0), "vacia.pdf"))).ok, false);
    const grande = await revisarGuia(archivo(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), "grande.pdf"));
    assert.ok(!grande.ok && /5 MB/.test(grande.error));
    const texto = await revisarGuia(archivo(Buffer.from("no soy un pdf"), "guia.pdf")); // la extensión no basta
    assert.ok(!texto.ok && /JPG, PNG o WebP, o un PDF/.test(texto.error));
    const ok = await revisarGuia(archivo(PDF, "Guía <Forza> 123.PDF"));
    assert.ok(ok.ok);
    assert.deepEqual([ok.archivo.ext, ok.archivo.nombre], ["pdf", "Guía Forza 123.pdf"]);
  });
});

describe("marcar como enviado (con base de datos)", () => {
  let agente: { id: string; nombre: string; rol: "agente" };
  let contactoId: string;
  let n = 0;
  const subidos: string[] = [];
  const canalesAntes = process.env.CHANNELS_ENABLED;

  const pedido = async (o: { canal?: Canal; entrega?: "envio" | "recoger" } = {}) => {
    const canal = o.canal ?? "simulado";
    const conversacionId = (await db.conversation.create({ data: { contactoId, canal, lastInboundAt: new Date() } })).id;
    return db.order.create({
      data: {
        codigo: `PRUEBA-GUIA-${++n}`, contactoId, conversacionId, canal, estado: "preparando", entrega: o.entrega ?? "envio", departamento: "Izabal", municipio: "Morales", direccion: "Barrio El Centro",
        subtotal: 10_000, total: 12_500, costoEnvio: 2_500, metodoPago: "transferencia", lineas: { create: [{ sku: "PRUEBA-GUIA", nombre: "PRUEBA-GUIA producto", precio: 10_000, cantidad: 1 }] },
      },
    });
  };
  const ultimos = (pedidoId: string) => db.message.findMany({ where: { pedidoId }, orderBy: { fecha: "asc" } });
  const anotar = async (pedidoId: string) => {
    const url = (await db.order.findUniqueOrThrow({ where: { id: pedidoId } })).guiaArchivoUrl;
    if (url) subidos.push(url.replace("/api/archivos/", ""));
  };

  before(async () => {
    process.env.CHANNELS_ENABLED = "simulado"; // Facebook queda sin adaptador: hace de canal que no deja enviar
    const u = await db.user.create({ data: { nombre: "Agente PRUEBA-GUIA", correo: "prueba-guia-agente@homeoutlet.test", passwordHash: "x", rol: "agente" } });
    agente = { id: u.id, nombre: u.nombre, rol: "agente" };
    contactoId = (await db.contact.create({ data: { nombre: "PRUEBA-GUIA cliente" } })).id;
    await db.channelIdentity.createMany({ data: [{ contactoId, canal: "simulado", externalContactId: "prueba-guia-sim" }, { contactoId, canal: "facebook", externalContactId: "prueba-guia-fb" }] });
  });

  after(async () => {
    canalesAntes === undefined ? delete process.env.CHANNELS_ENABLED : (process.env.CHANNELS_ENABLED = canalesAntes);
    await db.order.deleteMany({ where: { contactoId } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.activityLog.deleteMany({ where: { usuarioId: agente.id } });
    await db.user.deleteMany({ where: { id: agente.id } });
    for (const nombre of subidos) await unlink(path.join(process.cwd(), "uploads", nombre)).catch(() => {});
    await db.$disconnect();
  });

  test("entrega propia: sin guía ni archivo, y el aviso no habla de guía", async () => {
    const o = await pedido();
    await db.order.update({ where: { id: o.id }, data: { guia: "escrita antes" } });
    const r = await marcarEnviado(o.id, agente, { paqueteria: null, guia: "", archivo: null });
    assert.ok(r.ok && !r.guia, JSON.stringify(r));
    const guardado = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.deepEqual([guardado.estado, guardado.guia, guardado.paqueteria, guardado.guiaArchivoUrl], ["enviado", null, null, null]);
    assert.equal((await db.orderEvent.findFirstOrThrow({ where: { pedidoId: o.id, aEstado: "enviado" } })).nota, "Entrega propia");
    const avisos = await ultimos(o.id);
    assert.equal(avisos.length, 1);
    assert.doesNotMatch(avisos[0]!.texto!, /guía/i);
  });

  test("por paquetería con PDF: por un canal que manda documentos sale como documento, con su nombre", async () => {
    const o = await pedido();
    const r = await marcarEnviado(o.id, agente, { paqueteria: "Cargo Expreso", guia: "CE-55", archivo: archivo(PDF, "guia cargo.pdf") });
    await anotar(o.id);
    assert.ok(r.ok && r.guia?.estado === "enviada", JSON.stringify(r));
    const [aviso, doc] = await ultimos(o.id);
    assert.match(aviso!.texto!, /Paquetería: Cargo Expreso\nNúmero de guía: CE-55/);
    assert.deepEqual([doc!.tipo, doc!.archivoUrl, doc!.estado], ["document", r.guia.url, "enviado"]);
    assert.equal(r.guia.nombre, "guia cargo.pdf");
  });

  test("si el canal no deja enviar, el pedido igual queda enviado con la guía guardada, para mandarla a mano", async () => {
    const o = await pedido({ canal: "facebook" });
    const r = await marcarEnviado(o.id, agente, { paqueteria: "Forza", guia: "F-1", archivo: archivo(PNG, "foto.png") });
    await anotar(o.id);
    assert.ok(r.ok && r.aviso?.estado === "copiar" && r.guia?.estado === "manual", JSON.stringify(r));
    const guardado = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.deepEqual([guardado.estado, guardado.guiaArchivoNombre], ["enviado", "foto.png"]);
    assert.equal(await db.message.count({ where: { pedidoId: o.id } }), 0);
  });

  test("se rechaza: archivo que no es foto ni PDF, paquetería fuera de la lista, pedido para recoger; y no queda archivo suelto", async () => {
    const o = await pedido();
    const txt = await marcarEnviado(o.id, agente, { paqueteria: "Forza", guia: "F-2", archivo: archivo(Buffer.from("texto"), "guia.txt") });
    assert.ok(!txt.ok && /JPG, PNG o WebP, o un PDF/.test(txt.error));
    assert.equal((await marcarEnviado(o.id, agente, { paqueteria: "Inventada", guia: "F-2", archivo: archivo(PNG, "g.png") })).ok, false);
    const recoger = await pedido({ entrega: "recoger" });
    assert.equal((await marcarEnviado(recoger.id, agente, { paqueteria: null, guia: "", archivo: null })).ok, false);
    const sigue = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.deepEqual([sigue.estado, sigue.guiaArchivoUrl], ["preparando", null]);
  });
});
