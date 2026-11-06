import { db } from "@/lib/db";

// Límite de intentos fallidos por clave (correo, IP). Se guarda en la base (tabla `IntentoTasa`), así que vale con varios servidores.
export const MAX_INTENTOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;

/** Minutos de espera si la clave está bloqueada; 0 si puede intentar. */
export async function minutosBloqueado(clave: string, max = MAX_INTENTOS, ventanaMs = VENTANA_MS) {
  const desde = new Date(Date.now() - ventanaMs);
  const recientes = await db.intentoTasa.findMany({ where: { clave, creadoEn: { gt: desde } }, orderBy: { creadoEn: "asc" }, take: max, select: { creadoEn: true } });
  if (recientes.length < max) return 0;
  return Math.max(1, Math.ceil((recientes[0]!.creadoEn.getTime() + ventanaMs - Date.now()) / 60000));
}

export async function registrarFallo(clave: string, ventanaMs = VENTANA_MS) {
  await db.intentoTasa.create({ data: { clave } });
  if (Math.random() < 0.05) await db.intentoTasa.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - ventanaMs) } } }); // limpieza ocasional
}

export const limpiarFallos = (clave: string) => db.intentoTasa.deleteMany({ where: { clave } }).then(() => undefined);
