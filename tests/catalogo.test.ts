import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { ajustarExistencias, borrarProducto, guardarProducto, importarProductos, listarProductos, previsualizarProductos, ubicaciones } from "@/lib/catalogo";
import { db } from "@/lib/db";

// Necesita la base de datos (npm run db). Todo lo que crea lleva el prefijo PRUEBA y se borra al final.
const filtros = { q: "PRUEBA-CAT", categoriaId: "", estado: "todos" as const, pagina: 1 };
const encabezado = "sku,nombre,categoria,precio,descripcion,existencia_tienda,existencia_linea\n";

describe("catálogo", () => {
  let actor: { id: string; nombre: string };

  after(async () => {
    await db.message.deleteMany({ where: { producto: { sku: { startsWith: "PRUEBA-CAT" } } } });
    await db.conversation.deleteMany({ where: { contacto: { nombre: "PRUEBA-CAT contacto" } } });
    await db.contact.deleteMany({ where: { nombre: "PRUEBA-CAT contacto" } });
    await db.product.deleteMany({ where: { sku: { startsWith: "PRUEBA-CAT" } } });
    await db.category.deleteMany({ where: { nombre: { startsWith: "PRUEBA-CAT" } } });
    if (actor) await db.activityLog.deleteMany({ where: { usuarioId: actor.id } });
    await db.user.deleteMany({ where: { correo: "catalogo-prueba@homeoutlet.test" } });
    await db.$disconnect();
  });

  test("importar: crea, actualiza por SKU, crea la categoría y omite las filas con errores", async () => {
    actor = await db.user.create({ data: { nombre: "Admin del catálogo", correo: "catalogo-prueba@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    const [tienda, linea] = await ubicaciones();

    const csv1 = encabezado + ["PRUEBA-CAT-1,Licuadora,PRUEBA-CAT Hogar,Q349.00,Vidrio,5,2", "PRUEBA-CAT-2,Olla,PRUEBA-CAT Hogar,899,,0,0", "PRUEBA-CAT-3,Sin precio,PRUEBA-CAT Hogar,,,1,1"].join("\n");

    const vista = await previsualizarProductos(csv1);
    assert.deepEqual(vista.filas.map((f) => f.accion), ["crear", "crear", "error"]);
    assert.equal(vista.filas[0]!.categoriaNueva, true);
    assert.equal(await db.product.count({ where: { sku: { startsWith: "PRUEBA-CAT" } } }), 0, "la vista previa no guarda nada");

    const r1 = await importarProductos(csv1, actor);
    assert.deepEqual([r1.creados, r1.actualizados, r1.omitidas, r1.categoriasNuevas], [2, 0, 1, 1]);
    const p1 = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-CAT-1" }, include: { stock: true, categoria: true } });
    assert.equal(p1.precio, 34900);
    assert.equal(p1.categoria?.nombre, "PRUEBA-CAT Hogar");
    assert.equal(p1.stock.find((s) => s.ubicacionId === tienda!.id)?.cantidad, 5);
    assert.equal(p1.stock.find((s) => s.ubicacionId === linea!.id)?.cantidad, 2);

    // Segunda importación: el mismo SKU se actualiza, no se duplica, y la categoría ya existe
    const csv2 = encabezado + "PRUEBA-CAT-1,Licuadora nueva,prueba-cat hogar,400,,9,9\n";
    assert.equal((await previsualizarProductos(csv2)).filas[0]!.accion, "actualizar");
    const r2 = await importarProductos(csv2, actor);
    assert.deepEqual([r2.creados, r2.actualizados, r2.categoriasNuevas], [0, 1, 0]);
    const p1b = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-CAT-1" }, include: { stock: true } });
    assert.deepEqual([p1b.nombre, p1b.precio, p1b.stock.map((s) => s.cantidad).sort()], ["Licuadora nueva", 40000, [9, 9]]);
    assert.equal(await db.product.count({ where: { sku: "PRUEBA-CAT-1" } }), 1);
  });

  test("ajuste rápido: guarda las cantidades y registra solo lo que cambió", async () => {
    const p = await db.product.findUniqueOrThrow({ where: { sku: "PRUEBA-CAT-1" } });
    const [tienda, linea] = await ubicaciones();
    const r = await ajustarExistencias(p.id, { [tienda!.id]: 2, [linea!.id]: 9 }, actor); // la tienda baja de 9 a 2; en línea no cambia
    assert.deepEqual(r, { ok: true });
    const logs = await db.activityLog.findMany({ where: { accion: "existencias", entidadId: p.id, usuarioId: actor.id } });
    assert.equal(logs.length, 1);
    assert.deepEqual({ ...(logs[0]!.detalle as object) }, { sku: "PRUEBA-CAT-1", producto: "Licuadora nueva", ubicacion: tienda!.nombre, antes: 9, despues: 2, por: "Admin del catálogo" });

    const lista = await listarProductos(filtros);
    const fila = lista.filas.find((f) => f.sku === "PRUEBA-CAT-1")!;
    assert.equal(fila.existencias[tienda!.id], 2);
  });

  test("guardar: valida, no repite SKU y guarda fotos y existencias", async () => {
    const [tienda, linea] = await ubicaciones();
    const base = { sku: "PRUEBA-CAT-4", nombre: "Producto manual", descripcion: "", categoriaId: "", precio: "1,250.00", activo: true, imagenes: ["/placeholder/producto.svg"], existencias: { [tienda!.id]: 3, [linea!.id]: 0 } };

    assert.equal((await guardarProducto(null, { ...base, precio: "abc" }, actor)).ok, false);
    assert.equal((await guardarProducto(null, { ...base, sku: "con espacio" }, actor)).ok, false);
    assert.equal((await guardarProducto(null, { ...base, imagenes: Array(6).fill("/placeholder/producto.svg") }, actor)).ok, false);
    assert.equal((await guardarProducto(null, { ...base, existencias: { [tienda!.id]: -1 } }, actor)).ok, false);

    const creado = await guardarProducto(null, base, actor);
    assert.equal(creado.ok, true);
    const repetido = await guardarProducto(null, base, actor);
    assert.deepEqual(repetido, { ok: false, error: "Ya existe un producto con el SKU PRUEBA-CAT-4." });

    const id = creado.ok ? creado.id : "";
    const editado = await guardarProducto(id, { ...base, nombre: "Producto editado", activo: false, existencias: { [tienda!.id]: 7, [linea!.id]: 0 } }, actor);
    assert.equal(editado.ok, true);
    const p = await db.product.findUniqueOrThrow({ where: { id }, include: { stock: true } });
    assert.deepEqual([p.nombre, p.activo, p.precio, p.imagenes.length, p.stock.find((s) => s.ubicacionId === tienda!.id)?.cantidad], ["Producto editado", false, 125000, 1, 7]);

    const inactivos = await listarProductos({ ...filtros, estado: "inactivos" });
    assert.deepEqual(inactivos.filas.map((f) => f.sku), ["PRUEBA-CAT-4"]);
  });

  test("borrar: se puede, salvo que el producto ya se haya enviado a un cliente", async () => {
    const libre = await db.product.create({ data: { sku: "PRUEBA-CAT-5", nombre: "Libre", precio: 100 } });
    assert.deepEqual(await borrarProducto(libre.id, actor), { ok: true });
    assert.equal(await db.product.findUnique({ where: { id: libre.id } }), null);

    const enviado = await db.product.create({ data: { sku: "PRUEBA-CAT-6", nombre: "Enviado", precio: 100 } });
    const contacto = await db.contact.create({ data: { nombre: "PRUEBA-CAT contacto" } });
    const conv = await db.conversation.create({ data: { contactoId: contacto.id, canal: "simulado" } });
    await db.message.create({ data: { conversacionId: conv.id, direccion: "saliente", tipo: "product", productoId: enviado.id } });
    const r = await borrarProducto(enviado.id, actor);
    assert.equal(r.ok, false);
    assert.ok(await db.product.findUnique({ where: { id: enviado.id } }), "el producto sigue ahí");
  });
});
