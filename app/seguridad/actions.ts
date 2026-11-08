"use server";

import { z } from "zod";
import { limpiarFallos, minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";
import { confirmarActivacion } from "@/lib/segundo-factor-servicio";
import { requireSesionParcial } from "@/lib/session";

/** Confirma la activación con el código de la aplicación. Devuelve los códigos de respaldo, una sola vez. */
export async function confirmarSegundoFactor(codigo: string): Promise<{ ok: true; respaldos: string[] } | { ok: false; error: string }> {
  const { u, pendiente } = await requireSesionParcial();
  if (!pendiente) return { ok: false, error: "Esta cuenta no tiene nada pendiente de activar." };
  const clave = `2fa:${u.id}`;
  const espera = await minutosBloqueado(clave);
  if (espera > 0) return { ok: false, error: `Demasiados intentos. Vuelva a intentarlo en ${espera} min.` };
  const r = await confirmarActivacion(u.id, z.string().max(20).parse(codigo));
  if (!r.ok) await registrarFallo(clave);
  else await limpiarFallos(clave);
  return r;
}
