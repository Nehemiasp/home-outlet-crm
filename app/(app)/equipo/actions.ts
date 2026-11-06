"use server";

import { z } from "zod";
import { contarNoLeidos } from "@/lib/bandeja";
import { db } from "@/lib/db";
import { contarSinAsignar } from "@/lib/equipo/asignacion";
import { cambiarEstadoPorAdmin, panelEquipo, repartirConversaciones } from "@/lib/equipo/gestion";
import { activar, desconectarInactivos, disponibilidadDe, pausar as pausarAsesor, registrarLatido } from "@/lib/equipo/estado";
import { MOTIVOS_PAUSA, type FilaEquipo, type RespuestaLatido } from "@/lib/equipo/tipos";
import { requireUsuario } from "@/lib/session";

async function estadoActual(id: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  return disponibilidadDe(u);
}

/**
 * Lo llama la barra lateral cada pocos segundos en todas las pantallas: guarda la señal de que la persona
 * sigue ahí, cierra las sesiones sin señal y devuelve los contadores y el estado actual.
 */
export async function latido(): Promise<RespuestaLatido> {
  const u = await requireUsuario();
  await registrarLatido(u);
  await desconectarInactivos();
  return { noLeidos: await contarNoLeidos(u), sinAsignar: u.rol === "admin" ? await contarSinAsignar() : null, disponibilidad: await estadoActual(u.id), ahora: Date.now() };
}

type Resultado = { ok: true; disponibilidad: RespuestaLatido["disponibilidad"] } | { ok: false; error: string };
const NO_ASESOR: Resultado = { ok: false, error: "Solo los asesores tienen estado de disponibilidad." };

export async function pausar(motivo: string | null): Promise<Resultado> {
  const u = await requireUsuario();
  if (u.rol !== "agente") return NO_ASESOR;
  const m = z.enum(MOTIVOS_PAUSA).nullable().safeParse(motivo);
  if (!m.success) return { ok: false, error: "El motivo no es válido." };
  await pausarAsesor(u.id, m.data);
  return { ok: true, disponibilidad: await estadoActual(u.id) };
}

export async function activarme(): Promise<Resultado> {
  const u = await requireUsuario();
  if (u.rol !== "agente") return NO_ASESOR;
  await activar(u.id);
  return { ok: true, disponibilidad: await estadoActual(u.id) };
}

/* ── Panel del equipo (solo administradores) ── */
const soloAdmin = { ok: false, error: "Solo un administrador puede hacer esto." } as const;

/** Cada asesor con su estado, desde hace cuánto, el motivo de la pausa y cuántas conversaciones abiertas tiene. */
export async function obtenerPanelEquipo(): Promise<FilaEquipo[]> {
  const u = await requireUsuario();
  return u.rol === "admin" ? panelEquipo() : [];
}

export async function cambiarEstadoDeAsesor(asesorId: string, estado: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (u.rol !== "admin") return soloAdmin;
  const e = z.enum(["disponible", "en_pausa", "desconectado"]).safeParse(estado);
  if (!e.success) return { ok: false, error: "El estado no es válido." };
  return cambiarEstadoPorAdmin(z.string().min(1).max(40).parse(asesorId), e.data, u);
}

export async function repartirDeAsesor(asesorId: string): Promise<{ ok: true; repartidas: number; sinAsesor: number } | { ok: false; error: string }> {
  const u = await requireUsuario();
  if (u.rol !== "admin") return soloAdmin;
  return repartirConversaciones(z.string().min(1).max(40).parse(asesorId), u);
}
