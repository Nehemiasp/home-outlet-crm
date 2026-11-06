/** Un día del horario semanal: { abre: "08:00", cierra: "18:00" } o null si ese día la tienda cierra. */
export type DiaHorario = { abre: string; cierra: string } | null;
/** Siete días, de lunes (0) a domingo (6). */
export type HorarioSemanal = DiaHorario[];

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function horarioValido(h: unknown): h is HorarioSemanal {
  return Array.isArray(h) && h.length === 7 && h.every((d) => d === null || (typeof d === "object" && d !== null && HORA.test((d as { abre: string }).abre) && HORA.test((d as { cierra: string }).cierra) && (d as { abre: string }).abre < (d as { cierra: string }).cierra));
}

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Guatemala no tiene horario de verano: siempre UTC-6. */
const DESFASE_GT_MS = -6 * 3600_000;

/**
 * ¿Está abierta la tienda en este momento? Sin horario semanal configurado se toma como abierta,
 * para no apagar al asistente por un dato que falta.
 */
export function estaAbierto(horario: HorarioSemanal | null | undefined, ahora = new Date()): boolean {
  if (!horario) return true;
  const local = new Date(ahora.getTime() + DESFASE_GT_MS);
  const dia = horario[(local.getUTCDay() + 6) % 7];
  if (!dia) return false;
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return m >= minutos(dia.abre) && m < minutos(dia.cierra);
}
