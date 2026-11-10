import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "@/lib/db";
import { ejecutarHerramienta } from "@/lib/ia/herramientas";
import { enviarProductoConFotos } from "@/lib/mensajeria";

// Necesita la base de datos (npm run db). Lo que crea lleva el prefijo PRUEBA-FOTOS y se borra al final.
// Enviar un producto con varias fotos: la tarjeta con la primera elegida y, detrás, las demás como imágenes, en el orden del catálogo.

describe("enviar un producto con varias fotos (con base de datos)", () => {
  const FOTOS = ["/placeholder/producto.svg?f=1", "/placeholder/producto.svg?f=2", "/placeholder/producto.svg?f=3"];
  let contactoId: string | undefined;
  let conv = "";
  let producto = "";
  let sinFotos = "";
  let previo: string | undefined;

  const salientes = async () =>
    (await db.message.findMany({ where: { conversacionId: conv, direccion: "saliente" }, orderBy: { fecha: "asc" }, select: { tipo: true, archivoUrl: true, productoId: true } }))
      .map((m) => [m.tipo, m.archivoUrl, m.productoId ? "p" : "-"]);
  const limpiar = () => db.message.deleteMany({ where: { conversacionId: conv } });

  before(async () => {
    previo = process.env.CHANNELS_ENABLED;
    process.env.CHANNELS_ENABLED = "simulado";
    const c = await db.contact.create({ data: { nombre: "PRUEBA-FOTOS cliente" } });
    contactoId = c.id;
    await db.channelIdentity.create({ data: { contactoId, canal: "simulado", externalContactId: "prueba-fotos-sim" } });
    conv = (await db.conversation.create({ data: { contactoId, canal: "simulado", lastInboundAt: new Date() } })).id;
    producto = (await db.product.create({ data: { sku: "PRUEBA-FOTOS-1", nombre: "PRUEBA-FOTOS licuadora", precio: 34_900, imagenes: FOTOS } })).id;
    sinFotos = (await db.product.create({ data: { sku: "PRUEBA-FOTOS-2", nombre: "PRUEBA-FOTOS sin foto", precio: 9_900, imagenes: [] } })).id;
  });
  after(async () => {
    if (previo === undefined) delete process.env.CHANNELS_ENABLED;
    else process.env.CHANNELS_ENABLED = previo;
    if (!contactoId) return; // si el before falló, no hay nada propio que borrar
    await db.message.deleteMany({ where: { conversacionId: conv } });
    await db.conversation.deleteMany({ where: { contactoId } });
    await db.contact.deleteMany({ where: { id: contactoId } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-FOTOS-" } } });
  });

  test("sin elegir fotos sale la tarjeta con la principal, como antes", async () => {
    await limpiar();
    const r = await enviarProductoConFotos({ conversacionId: conv, productoId: producto });
    assert.ok(r.ok);
    assert.deepEqual(await salientes(), [["product", FOTOS[0], "p"]]);
  });

  test("las elegidas salen en el orden del catálogo: la tarjeta con la primera y las demás detrás", async () => {
    await limpiar();
    const r = await enviarProductoConFotos({ conversacionId: conv, productoId: producto, fotos: [FOTOS[2]!, FOTOS[0]!] });
    assert.ok(r.ok);
    assert.equal(r.mensajesIds?.length, 2);
    assert.deepEqual(await salientes(), [["product", FOTOS[0], "p"], ["image", FOTOS[2], "-"]]);
  });

  test("«todas» manda todas las fotos del producto", async () => {
    await limpiar();
    const r = await enviarProductoConFotos({ conversacionId: conv, productoId: producto, fotos: "todas" });
    assert.ok(r.ok);
    assert.deepEqual(await salientes(), [["product", FOTOS[0], "p"], ["image", FOTOS[1], "-"], ["image", FOTOS[2], "-"]]);
  });

  test("no se puede mandar una foto que no es del producto, y un producto sin fotos manda la tarjeta sola", async () => {
    await limpiar();
    const ajena = await enviarProductoConFotos({ conversacionId: conv, productoId: producto, fotos: ["/api/archivos/de-otro.png"] });
    assert.equal(ajena.ok, false);
    const mezcla = await enviarProductoConFotos({ conversacionId: conv, productoId: producto, fotos: ["/api/archivos/de-otro.png", FOTOS[1]!] });
    assert.ok(mezcla.ok); // la ajena se ignora, la propia sale
    const sola = await enviarProductoConFotos({ conversacionId: conv, productoId: sinFotos });
    assert.ok(sola.ok);
    assert.deepEqual(await salientes(), [["product", FOTOS[1], "p"], ["product", null, "p"]]);
  });

  test("el asistente manda todas las fotos solo si se lo pide la herramienta", async () => {
    await limpiar();
    const ctx = { conversacionId: conv, contactoId: contactoId!, sandbox: false };
    const una = await ejecutarHerramienta("enviar_producto", { id: producto }, ctx);
    assert.equal(una.mensajesEnviados?.length, 1);
    const todas = await ejecutarHerramienta("enviar_producto", { id: producto, todas_las_fotos: true }, ctx);
    assert.equal(todas.mensajesEnviados?.length, 3);
    assert.match(todas.consultado ?? "", /y sus 3 fotos/);
    assert.equal((await salientes()).length, 4);
    // En la pantalla de prueba no se manda nada, pero dice cuántas fotos saldrían.
    const prueba = await ejecutarHerramienta("enviar_producto", { id: producto, todas_las_fotos: true }, { ...ctx, sandbox: true });
    assert.match(prueba.contenido, /"fotos":3/);
    assert.equal((await salientes()).length, 4);
  });
});
