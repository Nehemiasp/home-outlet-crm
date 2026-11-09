/**
 * Cierre de sesión por inactividad. La sesión dura como máximo 12 horas (auth.ts); además se cierra si nadie usa el sistema
 * durante este tiempo, para que una computadora de la tienda que quedó abierta no siga entrando a pedidos, pagos y clientes.
 *
 * 30 minutos: el asesor que espera mensajes con la bandeja abierta suele tocar el sistema mucho antes, y quien se fue a almorzar
 * (o dejó la computadora) no queda adentro toda la tarde. El latido de cada 10 s NO cuenta como actividad: lo manda el navegador
 * solo, aunque no haya nadie; solo cuentan el ratón, el teclado y la pantalla táctil.
 */
export const MINUTOS_INACTIVIDAD = 30;

/** El aviso con la cuenta regresiva aparece este tiempo antes del cierre, para que quien está ahí pueda seguir. */
export const SEGUNDOS_DE_AVISO = 60;

/** Dónde se guarda la hora de la última actividad: la comparten todas las pestañas abiertas (usar una mantiene vivas las demás). */
export const CLAVE_ACTIVIDAD = "home-outlet:ultima-actividad";

/** Cookie corta (2 min, solo para /login) con la que la página de entrada sabe que la sesión se cerró por inactividad. */
export const COOKIE_SALIDA = "salida";

export type EstadoInactividad = { tipo: "activo" } | { tipo: "aviso"; segundos: number } | { tipo: "cerrar" };

/** Qué toca hacer según la última actividad (milisegundos): nada, avisar con los segundos que faltan, o cerrar. */
export function estadoInactividad(ultima: number, ahora: number, minutos = MINUTOS_INACTIVIDAD): EstadoInactividad {
  const falta = ultima + minutos * 60_000 - ahora;
  if (falta <= 0) return { tipo: "cerrar" };
  if (falta <= SEGUNDOS_DE_AVISO * 1000) return { tipo: "aviso", segundos: Math.ceil(falta / 1000) };
  return { tipo: "activo" };
}
