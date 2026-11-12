import "dotenv/config";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, describe, test } from "node:test";
import { asignarFotoPorSku, MAX_IMAGENES, skuDeArchivo } from "@/lib/catalogo";
import { db } from "@/lib/db";

// Necesita la base de datos (npm run db). Todo lo que crea lleva el prefijo PRUEBA-FS y se borra al final, con sus archivos.
const carpeta = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(process.cwd(), "uploads");
/** Un «JPG» de prueba: basta la firma para que se reconozca; cada número da un contenido distinto. */
const jpg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`PRUEBA-FS foto ${n} `.repeat(4))]);

describe("fotos por SKU", () => {
  let actor: { id: string; nombre: string };

  after(async () => {
    const productos = await db.product.findMany({ where: { sku: { startsWith: "PRUEBA-FS" } }, select: { imagenes: true } });
    for (const url of productos.flatMap((p) => p.imagenes)) await unlink(path.join(carpeta, url.replace("/api/archivos/", ""))).catch(() => {});
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-FS" } } });
    if (actor) await db.activityLog.deleteMany({ where: { usuarioId: actor.id } });
    await db.user.deleteMany({ where: { correo: "fotos-sku-prueba@homeoutlet.test" } });
    await db.$disconnect();
  });

  test("el SKU se toma del inicio del nombre del archivo, el más largo y sin confundir HO-001 con HO-0011", () => {
    const skus = ["HO-00", "HO-001", "HO-0011", "ABC"];
    assert.equal(skuDeArchivo("HO-001-aspiradora-portatil.jpg", skus), "HO-001");
    assert.equal(skuDeArchivo("ho-0011.png", skus), "HO-0011", "sin distinguir mayúsculas");
    assert.equal(skuDeArchivo("HO-001_2.webp", skus), "HO-001");
    assert.equal(skuDeArchivo("HO-001 frente.jpg", skus), "HO-001");
    assert.equal(skuDeArchivo("HO-001x.jpg", skus), null, "después del SKU tiene que venir -, _, punto o espacio");
    assert.equal(skuDeArchivo("foto-HO-001.jpg", skus), null, "el SKU va al inicio");
    assert.equal(skuDeArchivo("ABC.jpg", skus), "ABC");
  });

  test("la primera foto queda como principal, la misma no se repite y las demás se agregan hasta el máximo", async () => {
    actor = await db.user.create({ data: { nombre: "Admin de fotos", correo: "fotos-sku-prueba@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    await db.product.create({ data: { sku: "PRUEBA-FS-1", nombre: "PRUEBA-FS Linterna", precio: 23_500 } });
    await db.product.create({ data: { sku: "PRUEBA-FS-10", nombre: "PRUEBA-FS Bocina", precio: 27_500 } });

    const r1 = await asignarFotoPorSku("PRUEBA-FS-1-linterna.jpg", jpg(1), actor);
    assert.deepEqual(r1, { ok: true, sku: "PRUEBA-FS-1", producto: "PRUEBA-FS Linterna", estado: "principal" });
    const otra = await asignarFotoPorSku("prueba-fs-10.jpg", jpg(1), actor);
    assert.ok(otra.ok && otra.sku === "PRUEBA-FS-10" && otra.estado === "principal", "el mismo contenido en otro producto sí se agrega");

    const repetida = await asignarFotoPorSku("PRUEBA-FS-1-copia.jpg", jpg(1), actor);
    assert.ok(repetida.ok && repetida.estado === "repetida");
    assert.equal((await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-FS-1" } })).imagenes.length, 1, "volver a subir la carpeta no duplica");

    for (let n = 2; n <= MAX_IMAGENES; n++) {
      const r = await asignarFotoPorSku(`PRUEBA-FS-1_${n}.jpg`, jpg(n), actor);
      assert.ok(r.ok && r.estado === "agregada", `foto ${n}`);
    }
    const llena = await asignarFotoPorSku("PRUEBA-FS-1_extra.jpg", jpg(99), actor);
    assert.ok(!llena.ok && /máximo/.test(llena.error));

    const p = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-FS-1" } });
    assert.equal(p.imagenes.length, MAX_IMAGENES);
    assert.ok(p.imagenes.every((u) => /^\/api\/archivos\/[0-9a-f-]{36}\.jpg$/.test(u)), "se guardan como las fotos subidas a mano");
    assert.equal(await db.activityLog.count({ where: { usuarioId: actor.id, accion: "foto_por_sku" } }), MAX_IMAGENES + 1, "queda registro de cada foto agregada");
  });

  test("rechaza un archivo sin SKU conocido o que no es imagen, sin guardar nada", async () => {
    const sinSku = await asignarFotoPorSku("NO-EXISTE-123.jpg", jpg(7), actor);
    assert.ok(!sinSku.ok && /SKU/.test(sinSku.error));
    const noImagen = await asignarFotoPorSku("PRUEBA-FS-10.jpg", Buffer.from("esto no es una imagen, es texto plano"), actor);
    assert.ok(!noImagen.ok && /JPG, PNG o WebP/.test(noImagen.error));
    assert.equal((await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-FS-10" } })).imagenes.length, 1);
  });
});
