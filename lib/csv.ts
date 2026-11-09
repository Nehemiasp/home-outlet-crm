import { parsePrecio } from "@/lib/dinero";

export const MAX_FILAS = 2000;

/** Lee un CSV (comas o punto y coma, con comillas, con o sin BOM) y devuelve las filas no vacías. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  const cerrarCampo = () => {
    fila.push(campo);
    campo = "";
  };
  const cerrarFila = () => {
    cerrarCampo();
    if (fila.some((c) => c.trim() !== "")) filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (entreComillas) {
      if (c === '"' && t[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === sep) cerrarCampo();
    else if (c === "\n") cerrarFila();
    else if (c !== "\r") campo += c;
  }
  cerrarFila();
  return filas;
}

export type FilaProductoCsv = {
  linea: number; // número de línea en el archivo (la 1 es el encabezado)
  sku: string;
  nombre: string;
  categoria: string;
  precioCentavos: number;
  descripcion: string;
  tienda: number;
  enLinea: number;
  errores: string[];
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, "_");
const OBLIGATORIAS = ["sku", "nombre", "precio"];
const SKU_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

function entero(valor: string, nombre: string, errores: string[]) {
  const v = valor.trim();
  if (v === "") return 0;
  if (!/^\d{1,6}$/.test(v)) {
    errores.push(`${nombre} debe ser un número entero, sin decimales ni negativos.`);
    return 0;
  }
  return Number(v);
}

/** Revisa el CSV de productos fila por fila. Nada se guarda aquí. */
export function analizarProductosCsv(texto: string): { error?: string; filas: FilaProductoCsv[] } {
  const datos = parseCsv(texto);
  if (datos.length === 0) return { error: "El archivo está vacío.", filas: [] };

  const columnas = datos[0]!.map(norm);
  const faltan = OBLIGATORIAS.filter((c) => !columnas.includes(c));
  if (faltan.length) return { error: `Faltan estas columnas en el encabezado: ${faltan.join(", ")}.`, filas: [] };
  if (datos.length - 1 > MAX_FILAS) return { error: `El archivo tiene más de ${MAX_FILAS} filas. Divídalo en partes.`, filas: [] };

  const leer = (fila: string[], col: string) => (fila[columnas.indexOf(col)] ?? "").trim();
  const vistos = new Map<string, number>();

  const filas = datos.slice(1).map((fila, i): FilaProductoCsv => {
    const errores: string[] = [];
    const linea = i + 2;
    const sku = leer(fila, "sku");
    const nombre = leer(fila, "nombre");
    const descripcion = leer(fila, "descripcion");

    if (!sku) errores.push("Falta el SKU.");
    else if (!SKU_VALIDO.test(sku)) errores.push("El SKU solo puede tener letras, números, punto, guion y guion bajo (máximo 40).");
    else if (vistos.has(sku.toLowerCase())) errores.push(`El SKU ya aparece en la línea ${vistos.get(sku.toLowerCase())}.`);
    else vistos.set(sku.toLowerCase(), linea);

    if (!nombre) errores.push("Falta el nombre.");
    else if (nombre.length > 120) errores.push("El nombre pasa de 120 caracteres.");
    if (descripcion.length > 2000) errores.push("La descripción pasa de 2000 caracteres.");

    const textoPrecio = leer(fila, "precio");
    const precio = textoPrecio ? parsePrecio(textoPrecio) : null;
    if (precio === null) errores.push(textoPrecio ? `El precio "${textoPrecio}" no es válido.` : "Falta el precio.");
    else if (precio === 0) errores.push("El precio debe ser mayor que cero.");

    return {
      linea, sku, nombre, descripcion, errores,
      categoria: leer(fila, "categoria"),
      precioCentavos: precio ?? 0,
      // existencia_tienda y existencia_linea son los nombres de antes (Tienda física y Tienda en línea): se siguen aceptando.
      tienda: entero(leer(fila, "existencia_puerto_barrios") || leer(fila, "existencia_tienda"), "La existencia de Puerto Barrios", errores),
      enLinea: entero(leer(fila, "existencia_mixco") || leer(fila, "existencia_linea"), "La existencia de Mixco", errores),
    };
  });
  return { filas };
}
