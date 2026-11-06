import { spawn } from "node:child_process";
import { soltarCandado, tomarCandado } from "@/lib/candados";
import { desconectarInactivos } from "@/lib/equipo/estado";
import { vencerReservas } from "@/lib/pedidos/vencimiento";
import { registrarError } from "@/lib/registro";

/**
 * Tareas programadas dentro del propio servidor (se inician en `instrumentation.ts`, solo en producción), para no
 * depender de un servicio de cron aparte. Es seguro con varios servidores: cada tarea toma un candado en la base y solo
 * una la corre. Las rutas `POST /api/tareas/*` siguen existiendo por si se prefiere un cron externo.
 *   - cada minuto: pasar a Desconectado a quien lleva 5 min sin señal
 *   - cada 5 minutos: vencer las reservas sin pago
 *   - cada día a las 2:00 de Guatemala (con RESPALDO_AUTOMATICO=1): respaldo de la base y de los archivos subidos
 */

/** Hora (0–23) en Guatemala: UTC-6 y sin horario de verano. */
export const horaGuatemala = (d: Date) => (d.getUTCHours() + 18) % 24;
export const HORA_RESPALDO = 2;
const CANDADO_RESPALDO_MS = 20 * 3_600_000; // una vez por noche, aunque haya varios servidores o se reinicie

export type ResultadoRespaldo = "no toca" | "ocupado" | "hecho" | "fallo";

/** Corre el respaldo si ya es la hora y nadie más lo corrió hoy. `ejecutar` devuelve true si salió bien (se puede cambiar en pruebas). */
export async function respaldoSiToca(ahora = new Date(), ejecutar: () => Promise<boolean> = correrScriptDeRespaldo): Promise<ResultadoRespaldo> {
  if (horaGuatemala(ahora) !== HORA_RESPALDO) return "no toca";
  if (!(await tomarCandado("respaldo-diario", CANDADO_RESPALDO_MS))) return "ocupado";
  if (await ejecutar()) return "hecho";
  await soltarCandado("respaldo-diario"); // falló: que lo reintente en la siguiente vuelta (cada 10 min, mientras siga siendo la hora)
  return "fallo";
}

const correrScriptDeRespaldo = () =>
  new Promise<boolean>((fin) => {
    const hijo = spawn(process.execPath, ["scripts/respaldo.mjs"], { stdio: "inherit", env: process.env });
    hijo.on("error", () => fin(false));
    hijo.on("exit", (codigo) => fin(codigo === 0));
  });

export function iniciarProgramador(env: Record<string, string | undefined> = process.env) {
  const g = globalThis as { __programadorIniciado?: boolean };
  if (g.__programadorIniciado) return;
  g.__programadorIniciado = true;
  const cada = (nombre: string, ms: number, tarea: () => Promise<unknown>) =>
    setInterval(() => void tarea().catch((e) => registrarError(`programador ${nombre}`, e)), ms).unref(); // unref: no impide que el proceso termine
  cada("asesores", 60_000, () => desconectarInactivos());
  cada("reservas", 5 * 60_000, () => vencerReservas());
  if (env.RESPALDO_AUTOMATICO === "1") {
    cada("respaldo", 10 * 60_000, async () => {
      if ((await respaldoSiToca()) === "fallo") registrarError("respaldo", "el respaldo automático falló");
    });
  }
}
