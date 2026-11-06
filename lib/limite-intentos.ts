// ponytail: en memoria, vale para un solo servidor. Con varias instancias, moverlo a la base o a Redis.
const MAX = 5;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map<string, number[]>();

const recientes = (clave: string) => {
  const ahora = Date.now();
  const lista = (fallos.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  fallos.set(clave, lista);
  return lista;
};

/** Minutos de espera si la clave está bloqueada; 0 si puede intentar. */
export function minutosBloqueado(clave: string) {
  const lista = recientes(clave);
  if (lista.length < MAX) return 0;
  return Math.ceil((lista[0]! + VENTANA_MS - Date.now()) / 60000);
}
export const registrarFallo = (clave: string) => recientes(clave).push(Date.now());
export const limpiarFallos = (clave: string) => fallos.delete(clave);
