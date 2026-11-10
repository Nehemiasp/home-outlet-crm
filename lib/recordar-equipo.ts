import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { ipDelCliente } from "@/lib/ip";
import { DIAS_RECORDAR } from "@/lib/recordar-equipo-texto";
import { huellaDeClave } from "@/lib/sesion-vigente";

/**
 * «No volver a pedir el código en este equipo por 30 días» (10-nov-2026, lo pidió el dueño). Tras poner bien el código del
 * autenticador, el navegador recibe una cookie firmada que vale para ESE usuario, ESA IP y las credenciales de hoy:
 * - otro equipo, aunque esté en la misma red, no la tiene → pide el código;
 * - la misma cookie desde otra IP no coincide con la firma → pide el código (y, si se vuelve a marcar, queda recordada la nueva IP);
 * - si el administrador restablece la clave o quita o cambia el segundo factor, la huella cambia y la cookie deja de servir;
 * - vence a los 30 días de haber puesto el código (no se alarga sola).
 * La cookie no guarda la IP: solo una firma HMAC (con una clave derivada de AUTH_SECRET) sobre usuario, huella, IP y vencimiento.
 * La comprueba `authorize` (auth.ts) en el servidor; nada de lo que mande el navegador por su cuenta se la salta.
 */
export { DIAS_RECORDAR };
const PREFIJO = "ho_equipo_";

type Usuario = { id: string; passwordHash: string; totpSecreto: string | null };

function clave(): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new Error("Falta AUTH_SECRET: sin él no se puede recordar el equipo.");
  return Buffer.from(hkdfSync("sha256", base, "home-outlet", "recordar-equipo", 32));
}

/** Una cookie por usuario (en un equipo compartido cada quien tiene la suya); el nombre no revela el id. */
export const nombreCookie = (usuarioId: string) => PREFIJO + createHash("sha256").update(usuarioId).digest("hex").slice(0, 12);

const firma = (usuarioId: string, huella: string, ip: string, vence: number) => createHmac("sha256", clave()).update(`${usuarioId}|${huella}|${ip}|${vence}`).digest("base64url");

/** La IP con la que se recuerda. En desarrollo no hay proxy que dé una IP confiable: se usa «local» para poder probarlo. */
export const ipParaRecordar = (h: Headers): string | null => ipDelCliente(h) ?? (process.env.NODE_ENV === "production" ? null : "local");

/** El valor de la cookie: vencimiento (en segundos) y firma. Sin IP no se recuerda nada. */
export function firmarEquipo(u: Usuario, ip: string | null, ahora = Date.now()): string | null {
  if (!ip) return null;
  const vence = Math.floor(ahora / 1000) + DIAS_RECORDAR * 86_400;
  return `${vence}.${firma(u.id, huellaDeClave(u.passwordHash, u.totpSecreto), ip, vence)}`;
}

/** ¿Este valor de cookie recuerda a este usuario, con sus credenciales de hoy, desde esta IP y sin vencer? */
export function equipoRecordado(valor: string | undefined | null, u: Usuario, ip: string | null, ahora = Date.now()): boolean {
  if (!valor || !ip) return false;
  const [texto, dada] = valor.split(".");
  const vence = Number(texto);
  if (!Number.isInteger(vence) || !dada || vence * 1000 <= ahora) return false;
  const esperada = Buffer.from(firma(u.id, huellaDeClave(u.passwordHash, u.totpSecreto), ip, vence));
  const recibida = Buffer.from(dada);
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Lee la cookie del usuario en un encabezado Cookie. */
export function cookieDe(h: Headers, usuarioId: string): string | null {
  const nombre = nombreCookie(usuarioId);
  for (const parte of (h.get("cookie") ?? "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** ¿El equipo de esta petición (su cookie y su IP) está recordado para este usuario? */
export const recordadoEn = (h: Headers, u: Usuario, ahora = Date.now()) => equipoRecordado(cookieDe(h, u.id), u, ipParaRecordar(h), ahora);

/** Opciones de la cookie: solo la lee el servidor, solo por https en producción, y dura lo mismo que el recuerdo. */
export const opcionesCookie = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: DIAS_RECORDAR * 86_400 });
