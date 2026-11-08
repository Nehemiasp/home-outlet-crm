import type { Channel } from "./tipos";

/** Ventana de respuesta por canal: 24 horas desde el último mensaje del cliente (WhatsApp, Meta); TikTok da 48. */
const HORAS: Partial<Record<Channel, number>> = { tiktok: 48 };
export const horasVentana = (canal?: Channel) => (canal && HORAS[canal]) || 24;

/** La ventana de 24 horas (la de casi todos los canales). */
export const VENTANA_MS = 24 * 3600_000;
/** Cuando quedan menos de 3 horas, la bandeja avisa. */
export const AVISO_MS = 3 * 3600_000;

export const msRestantes = (lastInboundAt: Date | null, ahora = new Date(), canal?: Channel) =>
  lastInboundAt ? Math.max(0, lastInboundAt.getTime() + horasVentana(canal) * 3600_000 - ahora.getTime()) : 0;

export const ventanaAbierta = (lastInboundAt: Date | null, ahora = new Date(), canal?: Channel) => msRestantes(lastInboundAt, ahora, canal) > 0;

/** Los canales que no tienen plantillas aprobadas: con la ventana cerrada solo queda esperar a que el cliente escriba. */
const SIN_PLANTILLAS: readonly Channel[] = ["tiktok", "facebook", "instagram"];

export const sinPlantillas = (canal?: Channel) => !!canal && SIN_PLANTILLAS.includes(canal);

/** El error cuando alguien intenta escribir con la ventana cerrada. */
export const textoVentanaCerrada = (canal?: Channel) =>
  `Pasaron más de ${horasVentana(canal)} horas desde el último mensaje del cliente. ${sinPlantillas(canal) ? "Podrá responder cuando el cliente vuelva a escribir." : "Solo se pueden enviar plantillas aprobadas."}`;

/** El aviso de la bandeja (junto al compositor bloqueado). */
export const textoBloqueoVentana = (canal?: Channel) =>
  `Pasaron más de ${horasVentana(canal)} horas desde el último mensaje del cliente. ${sinPlantillas(canal) ? "Podrá responder cuando el cliente vuelva a escribir; mientras tanto puede escribir notas internas." : "Solo puede enviar plantillas o escribir notas internas."}`;

/** 8_100_000 ms → "2 h 15 min". Redondea hacia arriba al minuto. */
export function textoRestante(ms: number) {
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
