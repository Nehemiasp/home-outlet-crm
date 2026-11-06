/** Devuelve el teléfono en formato E.164 (+50255551234) o null si no es válido. Un número de 8 dígitos se toma como de Guatemala. */
export function normalizarTelefono(entrada: string): string | null {
  const limpio = entrada.trim().replace(/[\s().-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(limpio)) return limpio;
  if (/^00[1-9]\d{7,14}$/.test(limpio)) return "+" + limpio.slice(2);
  if (/^502[2-7]\d{7}$/.test(limpio)) return "+" + limpio;
  if (/^[2-7]\d{7}$/.test(limpio)) return "+502" + limpio;
  return null;
}
