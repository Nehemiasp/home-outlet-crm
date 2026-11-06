import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analizarProductosCsv, parseCsv } from "@/lib/csv";
import { parsePrecio } from "@/lib/dinero";

describe("precios", () => {
  test("formatos que escribe la gente", () => {
    const casos: [string, number][] = [["1250", 125000], ["1,250.00", 125000], ["1.250,50", 125050], ["Q1,250.00", 125000], ["Q 99", 9900], ["12,50", 1250], ["12.5", 1250], ["1,250", 125000], ["0.99", 99], ["349.9", 34990]];
    for (const [entrada, esperado] of casos) assert.equal(parsePrecio(entrada), esperado, entrada);
  });
  test("rechaza lo que no es un precio", () => {
    for (const t of ["", "abc", "-5", "12.345,678", "1e5", "Q", "99999999999"]) assert.equal(parsePrecio(t), null, t);
  });
});

describe("lector de CSV", () => {
  test("comillas, comas dentro de un campo, saltos de línea y BOM", () => {
    const filas = parseCsv('﻿sku,nombre\r\nA1,"Olla, grande"\r\nA2,"Dice ""hola"""\r\n\r\nA3,"Dos\nlíneas"\r\n');
    assert.deepEqual(filas, [["sku", "nombre"], ["A1", "Olla, grande"], ["A2", 'Dice "hola"'], ["A3", "Dos\nlíneas"]]);
  });
  test("detecta el punto y coma (Excel en español)", () => {
    assert.deepEqual(parseCsv("sku;nombre;precio\nA1;Olla;12,50"), [["sku", "nombre", "precio"], ["A1", "Olla", "12,50"]]);
  });
});

describe("importar productos: revisión fila por fila", () => {
  const encabezado = "sku,nombre,categoria,precio,descripcion,existencia_tienda,existencia_linea\n";

  test("filas válidas, con encabezados con tilde o mayúsculas", () => {
    const r = analizarProductosCsv("SKU,Nombre,Categoría,Precio,Descripción,Existencia_Tienda,Existencia_Linea\nHG-1,Licuadora,Hogar,Q349.00,Vidrio,5,2\nHG-2,Olla,,899,,,\n");
    assert.equal(r.error, undefined);
    assert.deepEqual(r.filas.map((f) => f.errores), [[], []]);
    assert.deepEqual([r.filas[0]!.precioCentavos, r.filas[0]!.tienda, r.filas[0]!.enLinea, r.filas[0]!.categoria], [34900, 5, 2, "Hogar"]);
    assert.deepEqual([r.filas[1]!.tienda, r.filas[1]!.enLinea], [0, 0]); // vacío = 0
  });

  test("marca cada error en su fila y sigue con las demás", () => {
    const r = analizarProductosCsv(
      encabezado + ["HG-1,Licuadora,Hogar,349,,5,2", ",Sin sku,Hogar,10,,1,1", "HG-1,Repetido,Hogar,10,,1,1", "HG-3,Sin precio,Hogar,,,1,1", "HG-4,Precio malo,Hogar,abc,,1,1", "HG-5,Precio cero,Hogar,0,,1,1", "HG-6,Existencia mala,Hogar,10,,-3,1.5", "HG 7,Sku con espacio,Hogar,10,,1,1"].join("\n"),
    );
    const por = r.filas.map((f) => f.errores.length);
    assert.deepEqual(por, [0, 1, 1, 1, 1, 1, 2, 1]);
    assert.match(r.filas[2]!.errores[0]!, /línea 2/);
    assert.equal(r.filas[1]!.linea, 3); // la línea 1 es el encabezado
  });

  test("falta una columna obligatoria, archivo vacío o demasiado grande", () => {
    assert.match(analizarProductosCsv("sku,nombre\nA,B").error!, /precio/);
    assert.match(analizarProductosCsv("").error!, /vacío/);
    assert.match(analizarProductosCsv(encabezado + Array.from({ length: 2001 }, (_, i) => `S${i},N,,1,,0,0`).join("\n")).error!, /2000/);
  });
});
