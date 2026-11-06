// Tipos y constantes del equipo que también usan las pantallas (nada de base de datos aquí).

export type EstadoAsesorVista = "disponible" | "en_pausa" | "desconectado";

export const MOTIVOS_PAUSA = ["Almuerzo", "Atendiendo en tienda", "Otro"] as const;
export type MotivoPausa = (typeof MOTIVOS_PAUSA)[number];

/** Sin latido durante este tiempo, el asesor pasa a Desconectado. */
export const SIN_SENAL_MS = 5 * 60_000;
/** Cada cuánto se le pregunta a quien sigue en pausa si quiere volver a recibir conversaciones. */
export const AVISO_PAUSA_MS = 15 * 60_000;
/** Una pausa o desconexión más larga que esto con conversaciones abiertas permite repartirlas. */
export const AUSENCIA_LARGA_MS = 30 * 60_000;

/** El estado del asesor de la sesión, tal como lo ve la barra superior. */
export type Disponibilidad = { estado: EstadoAsesorVista; desde: string; motivo: string | null };

export type RespuestaLatido = {
  noLeidos: number;
  /** Conversaciones que esperan un asesor: solo se calcula para administradores (null para los demás). */
  sinAsignar: number | null;
  /** null para quien no es asesor (los administradores no tienen estado). */
  disponibilidad: Disponibilidad | null;
  /** Hora del servidor en el momento de responder: sirve para contar los minutos sin depender del reloj del navegador. */
  ahora: number;
};

/** Un asesor en el panel del equipo (solo administradores). */
export type FilaEquipo = {
  id: string;
  nombre: string;
  estado: EstadoAsesorVista;
  desde: string;
  motivo: string | null;
  abiertas: number;
  /** Más de 30 minutos en pausa o desconectado con conversaciones abiertas: se pueden repartir. */
  puedeRepartir: boolean;
};
