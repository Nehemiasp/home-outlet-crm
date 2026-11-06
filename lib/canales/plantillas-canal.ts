/** Texto de las plantillas de canal. Sin dependencias del servidor: también lo usa la ventana del navegador. */

/** Cuántas variables ({{1}}, {{2}}…) pide el texto: la más alta que aparece. */
export const contarVariables = (cuerpo: string) => Math.max(0, ...[...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));

/** Reemplaza {{n}} por el valor n-ésimo; si falta, deja la marca a la vista. */
export const armarCuerpo = (cuerpo: string, parametros: string[]) => cuerpo.replace(/\{\{(\d+)\}\}/g, (marca, n) => parametros[Number(n) - 1]?.trim() || marca);
