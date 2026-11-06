import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Rol } from "@/generated/prisma/client";

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

/** Validación en el servidor: sin sesión va a /login; con otro rol, a la bandeja. */
export async function requireUsuario(rol?: Rol) {
  const u = await getUsuario();
  if (!u) redirect("/login");
  if (rol && u.rol !== rol) redirect("/bandeja");
  return u;
}
