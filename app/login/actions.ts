"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { alCerrarSesion } from "@/lib/equipo/estado";
import { ipDelCliente } from "@/lib/ip";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";

const MENSAJE_ERROR = "El correo o la contraseña no son correctos.";

export type EstadoLogin = { error: string; correo: string } | undefined;

export async function entrar(_previo: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const correo = String(datos.get("correo") ?? "").trim().toLowerCase();
  const ip = ipDelCliente(await headers());
  const claves = ip ? [`correo:${correo}`, `ip:${ip}`] : [`correo:${correo}`]; // sin proxy confiable no hay IP que valga

  const espera = Math.max(...(await Promise.all(claves.map((c) => minutosBloqueado(c)))));
  if (espera > 0) return { error: `Demasiados intentos. Vuelva a intentarlo en ${espera} min.`, correo };

  try {
    await signIn("credentials", { correo, password: String(datos.get("password") ?? ""), redirectTo: "/bandeja" });
  } catch (e) {
    if (e instanceof AuthError) {
      await Promise.all(claves.map((c) => registrarFallo(c)));
      return { error: MENSAJE_ERROR, correo };
    }
    // Entrar bien termina con una redirección, que Next lanza como excepción: ahí se limpian los fallos del correo
    // (no los de la IP: si quien rocía contraseñas tiene una cuenta propia, no debe poder reiniciar su límite entrando con ella).
    if (String((e as { digest?: unknown })?.digest ?? "").startsWith("NEXT_REDIRECT")) await limpiarFallos(`correo:${correo}`);
    throw e; // la redirección debe seguir su camino
  }
}

export async function salir() {
  const correo = (await auth())?.user?.email;
  const u = correo ? await db.user.findUnique({ where: { correo }, select: { id: true } }) : null;
  if (u) await alCerrarSesion(u.id); // cerrar sesión lo pasa a Desconectado
  await signOut({ redirectTo: "/login" });
}
