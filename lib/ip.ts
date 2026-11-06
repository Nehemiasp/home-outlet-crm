/**
 * IP del cliente para los límites de tasa. `x-forwarded-for` solo es confiable si hay un proxy propio que lo fija:
 * sin proxy, cualquiera puede escribirlo. Por eso en producción solo se usa si `PROXIES_CONFIABLES` dice cuántos
 * proxies hay delante (Railway, Vercel, Nginx: normalmente 1) y entonces se toma la dirección que agregó el último de
 * ellos, contando desde la derecha, nunca la de la izquierda (esa la escribe el cliente).
 * Devuelve null si no hay una IP confiable: quien llama debe limitarse solo por la otra clave (el correo).
 */
export function ipDelCliente(h: Headers): string | null {
  if (process.env.NODE_ENV !== "production") return null; // en desarrollo todos entran desde «local»: una clave por IP bloquearía a todos a la vez
  const saltos = Number.parseInt(process.env.PROXIES_CONFIABLES ?? "0", 10);
  if (!(saltos > 0)) return null;
  const lista = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return lista[lista.length - saltos] ?? null;
}
