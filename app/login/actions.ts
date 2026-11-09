"use server";

import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import { verificarClave } from "@/lib/credenciales";
import { db } from "@/lib/db";
import { alCerrarSesion } from "@/lib/equipo/estado";
import { COOKIE_SALIDA } from "@/lib/inactividad";
import { ipDelCliente } from "@/lib/ip";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";
import { requiereSegundoFactor } from "@/lib/permisos";
import { MENSAJE_CODIGO_MALO } from "@/lib/segundo-factor";

const MENSAJE_ERROR = "El correo o la contraseña no son correctos.";

/** `paso: "codigo"` = la contraseña estuvo bien y falta el código de la aplicación de autenticación. */
export type EstadoLogin = { error?: string; correo: string; paso?: "codigo" } | undefined;

export async function entrar(_previo: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const correo = String(datos.get("correo") ?? "").trim().toLowerCase();
  const password = String(datos.get("password") ?? "");
  const codigo = String(datos.get("codigo") ?? "").trim();
  const paso = codigo ? ("codigo" as const) : undefined; // si ya estaba en el segundo paso, sigue en él aunque falle
  const ip = ipDelCliente(await headers());
  (await cookies()).delete({ name: COOKIE_SALIDA, path: "/login" }); // quien vuelve a entrar ya vio el aviso de inactividad
  const claves = ip ? [`correo:${correo}`, `ip:${ip}`] : [`correo:${correo}`]; // sin proxy confiable no hay IP que valga

  const espera = Math.max(...(await Promise.all(claves.map((c) => minutosBloqueado(c)))));
  if (espera > 0) return { error: `Demasiados intentos. Vuelva a intentarlo en ${espera} min.`, correo, paso };

  // Primer paso: con la contraseña bien, quien tiene segundo factor activo pasa a escribir su código (no cuenta como intento fallido).
  if (!codigo) {
    const u = await verificarClave(correo, password);
    if (u && requiereSegundoFactor(u) && u.totpSecreto) return { correo, paso: "codigo" };
  }

  try {
    await signIn("credentials", { correo, password, codigo, redirectTo: "/bandeja" });
  } catch (e) {
    if (e instanceof AuthError) {
      await Promise.all(claves.map((c) => registrarFallo(c))); // un código malo cuenta igual que una contraseña mala: 5 en 15 minutos y se bloquea
      return { error: codigo ? MENSAJE_CODIGO_MALO : MENSAJE_ERROR, correo, paso };
    }
    // Entrar bien termina con una redirección, que Next lanza como excepción: ahí se limpian los fallos del correo
    // (no los de la IP: si quien rocía contraseñas tiene una cuenta propia, no debe poder reiniciar su límite entrando con ella).
    if (String((e as { digest?: unknown })?.digest ?? "").startsWith("NEXT_REDIRECT")) await limpiarFallos(`correo:${correo}`);
    throw e; // la redirección debe seguir su camino
  }
}

/**
 * Desde el botón «Salir» llega el FormData del formulario; el cierre por inactividad la llama con "inactividad". El motivo va en una
 * cookie corta y no en la dirección: al cerrarse la sesión, el latido y la propia pantalla también redirigen a /login (sin nada más) y
 * cualquiera de esas redirecciones puede llegar última. Así /login lo muestra llegue por donde llegue.
 */
export async function salir(motivo?: unknown) {
  const correo = (await auth())?.user?.email;
  const u = correo ? await db.user.findUnique({ where: { correo }, select: { id: true } }) : null;
  if (u) await alCerrarSesion(u.id); // cerrar sesión lo pasa a Desconectado
  const galletas = await cookies();
  if (motivo === "inactividad") galletas.set(COOKIE_SALIDA, "inactividad", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/login", maxAge: 120 });
  else galletas.delete({ name: COOKIE_SALIDA, path: "/login" });
  await signOut({ redirectTo: "/login" });
}
