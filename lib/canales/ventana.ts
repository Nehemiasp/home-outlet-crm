/** Ventana de respuesta de 24 horas desde el último mensaje del cliente (regla de WhatsApp). */
export const VENTANA_MS = 24 * 3600_000;
/** Cuando quedan menos de 3 horas, la bandeja avisa. */
export const AVISO_MS = 3 * 3600_000;

export const msRestantes = (lastInboundAt: Date | null, ahora = new Date()) =>
  lastInboundAt ? Math.max(0, lastInboundAt.getTime() + VENTANA_MS - ahora.getTime()) : 0;

export const ventanaAbierta = (lastInboundAt: Date | null, ahora = new Date()) => msRestantes(lastInboundAt, ahora) > 0;

/** 8_100_000 ms → "2 h 15 min". Redondea hacia arriba al minuto. */
export function textoRestante(ms: number) {
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
