import { createHash } from "node:crypto";
import { requiereSegundoFactor } from "@/lib/permisos";
import type { Rol } from "@/lib/permisos";

/**
 * Huella de las credenciales: un pedazo del hash de la clave y del secreto del segundo factor, que va dentro de la sesión. Si el
 * administrador restablece la clave de alguien, o activa o quita su segundo factor, la huella cambia y la sesión que ya estaba
 * abierta (en otro equipo, o robada) deja de servir al instante, sin esperar a que venza. No revela nada: es la mitad del SHA-256
 * de ambos datos, y la sesión va cifrada.
 */
export const huellaDeClave = (passwordHash: string, totpSecreto?: string | null) => createHash("sha256").update(`${passwordHash}|${totpSecreto ?? ""}`).digest("hex").slice(0, 16);

type Credenciales = { activo: boolean; passwordHash: string; totpSecreto?: string | null };

/** ¿La sesión sigue valiendo para este usuario? Debe existir, estar activo y haber entrado con las credenciales que tiene hoy. */
export const sesionVigente = (u: Credenciales | null | undefined, huella: string | undefined): boolean =>
  !!u?.activo && !!huella && huella === huellaDeClave(u.passwordHash, u.totpSecreto);

/** El segundo factor es obligatorio en producción; en desarrollo se prueba con SEGUNDO_FACTOR=1 (así la demostración sigue abierta). */
export const segundoFactorObligatorio = (env: Record<string, string | undefined> = process.env) => env.NODE_ENV === "production" || env.SEGUNDO_FACTOR === "1";

/**
 * ¿Falta el segundo factor? Pasa cuando el rol lo exige y la sesión no lo verificó al entrar (`verificado`): por ejemplo, quien todavía
 * no lo activó, o quien llegó a este rol después de entrar. Con esto pendiente la sesión solo sirve para ir a activarlo.
 */
export const segundoFactorPendiente = (u: { rol: Rol }, verificado: boolean | undefined, obligatorio = segundoFactorObligatorio()) => obligatorio && requiereSegundoFactor(u) && verificado !== true;
