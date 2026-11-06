// Formatos de fecha y hora para la bandeja (se calculan en el navegador, con su zona horaria).
const LOCAL = "es-GT";

export const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString(LOCAL, { hour: "2-digit", minute: "2-digit", hour12: false });

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasDeDiferencia = (iso: string, ahora = new Date()) => Math.round((inicioDelDia(ahora) - inicioDelDia(new Date(iso))) / 86_400_000);

/** Hora en la lista: "10:42" hoy, "Ayer", o "28 oct". */
export function horaLista(iso: string) {
  const dias = diasDeDiferencia(iso);
  if (dias <= 0) return horaCorta(iso);
  if (dias === 1) return "Ayer";
  return new Date(iso).toLocaleDateString(LOCAL, { day: "numeric", month: "short" }).replace(".", "");
}

/** Separador de día dentro de la conversación: "Hoy", "Ayer" o "28 de octubre". */
export function etiquetaDia(iso: string) {
  const dias = diasDeDiferencia(iso);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  const f = new Date(iso);
  const mismoAnio = f.getFullYear() === new Date().getFullYear();
  return f.toLocaleDateString(LOCAL, { day: "numeric", month: "long", ...(mismoAnio ? {} : { year: "numeric" }) });
}

export const claveDia = (iso: string) => new Date(inicioDelDia(new Date(iso))).toISOString();
