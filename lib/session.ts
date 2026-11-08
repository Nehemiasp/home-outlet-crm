import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inicioDe, type Rol } from "@/lib/permisos";

/**
 * Usuario de la sesión, leído de la base en cada petición: así un usuario
 * desactivado o con otro rol pierde acceso al instante, sin esperar a que venza el token.
 */
export async function getUsuario() {
  const correo = (await auth())?.user?.email;
  if (!correo) return null;
  const u = await db.user.findUnique({ where: { correo } });
  return u?.activo ? u : null;
}

/**
 * Validación en el servidor: sin sesión va a /login; con otro rol, a donde empieza esa persona.
 * El rol de bodega queda FUERA por defecto: lo que no lo admite expresamente (con `requireConBodega`) lo rechaza,
 * así una pantalla o acción nueva nunca queda abierta a bodega por olvido.
 */
export async function requireUsuario(rol?: Rol) {
  const u = await getUsuario();
  if (!u) redirect("/login");
  if (u.rol === "bodega") redirect(inicioDe(u));
  if (rol && u.rol !== rol) redirect(inicioDe(u));
  return u;
}

/** Para lo que también usa bodega (el marco de la aplicación, el catálogo y el despacho). Cualquier otro uso es un error de permisos. */
export async function requireConBodega() {
  const u = await getUsuario();
  if (!u) redirect("/login");
  return u;
}

/** Igual, pero por permiso (de `lib/permisos.ts`): sin él va a `destino`. */
export async function requirePermiso(permiso: (u: { rol: Rol }) => boolean, destino = "/bandeja") {
  const u = await requireUsuario();
  if (!permiso(u)) redirect(destino);
  return u;
}
