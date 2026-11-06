"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { alCerrarSesion } from "@/lib/equipo/estado";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";

const MENSAJE_ERROR = "El correo o la contraseña no son correctos.";

export type EstadoLogin = { error: string; correo: string } | undefined;

export async function entrar(_previo: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const correo = String(datos.get("correo") ?? "").trim().toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const claves = [`correo:${correo}`, `ip:${ip}`];

  const espera = Math.max(...claves.map(minutosBloqueado));
  if (espera > 0) return { error: `Demasiados intentos. Vuelva a intentarlo en ${espera} min.`, correo };

  try {
    await signIn("credentials", { correo, password: String(datos.get("password") ?? ""), redirectTo: "/bandeja" });
  } catch (e) {
    if (e instanceof AuthError) {
      claves.forEach(registrarFallo);
      return { error: MENSAJE_ERROR, correo };
    }
    throw e; // la redirección de Next también es una excepción: debe seguir su camino
  }
  claves.forEach(limpiarFallos);
}

export async function salir() {
  const correo = (await auth())?.user?.email;
  const u = correo ? await db.user.findUnique({ where: { correo }, select: { id: true } }) : null;
  if (u) await alCerrarSesion(u.id); // cerrar sesión lo pasa a Desconectado
  await signOut({ redirectTo: "/login" });
}
