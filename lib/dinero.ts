/**
 * Convierte lo que escribe una persona a centavos de quetzal, o null si no es un precio válido.
 * Acepta "1250", "1,250.00", "1.250,50", "Q1,250.00" y "12,50".
 */
export function parsePrecio(entrada: string): number | null {
  const t = entrada.trim().replace(/^Q\s*/i, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;

  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  const sep = Math.max(coma, punto);
  let enteros = t;
  let decimales = "";
  if (sep !== -1) {
    const despues = t.slice(sep + 1);
    // Es separador decimal si hay coma y punto (manda el último) o si solo hay uno y le siguen 1 o 2 dígitos.
    if ((coma !== -1 && punto !== -1) || /^\d{1,2}$/.test(despues)) {
      enteros = t.slice(0, sep);
      decimales = despues;
    }
  }
  enteros = enteros.replace(/[.,]/g, "");
  if (!/^\d+$/.test(enteros) || decimales.length > 2 || (decimales !== "" && !/^\d+$/.test(decimales))) return null;
  if (enteros.length > 8) return null; // más de Q99,999,999 es un error de digitación
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}
