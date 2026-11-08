import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inicioDe, type Rol } from "@/lib/permisos";
import { segundoFactorPendiente, sesionVigente } from "@/lib/sesion-vigente";

/**
 * La sesión leída de la base en cada petición: así un usuario desactivado, con otro rol o con la contraseña restablecida pierde
 * acceso al instante, sin esperar a que venza el token. `pendiente` = le falta activar el segundo factor (solo puede ir a activarlo).
 */
export async function getSesion() {
  const sesion = await auth();
  const correo = sesion?.user?.email;
  if (!correo) return null;
  const u = await db.user.findUnique({ where: { correo } });
  // Además de existir y estar activo, debe haber entrado con las credenciales de hoy (clave y segundo factor).
  if (!u || !sesionVigente(u, (sesion as { ph?: string } | null)?.ph)) return null;
  return { u, pendiente: segundoFactorPendiente(u, (sesion as { sf?: boolean } | null)?.sf) };
}

/** El usuario de una sesión completa; null sin sesión o si todavía le falta activar el segundo factor. */
export async function getUsuario() {
  const s = await getSesion();
  return s && !s.pendiente ? s.u : null;
}

/** Sin sesión va a /login; con el segundo factor pendiente, a activarlo. */
async function sesionCompleta() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.pendiente) redirect("/seguridad");
  return s.u;
}

/**
 * Validación en el servidor: sin sesión va a /login; con otro rol, a donde empieza esa persona.
 * El rol de bodega queda FUERA por defecto: lo que no lo admite expresamente (con `requireConBodega`) lo rechaza,
 * así una pantalla o acción nueva nunca queda abierta a bodega por olvido.
 */
export async function requireUsuario(rol?: Rol) {
  const u = await sesionCompleta();
  if (u.rol === "bodega") redirect(inicioDe(u));
  if (rol && u.rol !== rol) redirect(inicioDe(u));
  return u;
}

/** Para lo que también usa bodega (el marco de la aplicación, el catálogo y el despacho). Cualquier otro uso es un error de permisos. */
export async function requireConBodega() {
  return sesionCompleta();
}

/** Igual, pero por permiso (de `lib/permisos.ts`): sin él va a `destino`. */
export async function requirePermiso(permiso: (u: { rol: Rol }) => boolean, destino = "/bandeja") {
  const u = await requireUsuario();
  if (!permiso(u)) redirect(destino);
  return u;
}

/** SOLO para la pantalla de activar el segundo factor: acepta la sesión a medias (la que todavía no lo tiene). */
export async function requireSesionParcial() {
  const s = await getSesion();
  if (!s) redirect("/login");
  return s;
}
