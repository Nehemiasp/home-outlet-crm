import { db } from "@/lib/db";
import type { EstadoAsesor, OrigenEstadoAsesor } from "@/generated/prisma/client";
import { procesarCola } from "./asignacion";
import { SIN_SENAL_MS, type Disponibilidad, type MotivoPausa } from "./tipos";

type Cambio = {
  estado: EstadoAsesor;
  motivo?: string | null;
  origen: OrigenEstadoAsesor;
  /** Quién lo cambió cuando no fue el propio asesor (un administrador). */
  cambiadoPorId?: string | null;
  ahora?: Date;
  /** Solo cambia si el asesor está en uno de estos estados (evita pisar un cambio que acaba de pasar). */
  soloSiEstaba?: EstadoAsesor[];
  /** Solo cambia si su última señal es anterior a esta hora (o no tiene ninguna). */
  sinSenalAntesDe?: Date;
};

/**
 * Cambia el estado de un asesor y deja constancia en el historial (usuario, estado, motivo, inicio y fin).
 * Es atómico y no hace nada si el asesor ya estaba en ese estado. Solo los usuarios con rol agente tienen estado.
 * Devuelve si hubo cambio. Al pasar a Disponible se reparten las conversaciones que esperaban.
 */
export async function cambiarEstadoAsesor(usuarioId: string, c: Cambio): Promise<boolean> {
  const ahora = c.ahora ?? new Date();
  const motivo = c.estado === "en_pausa" ? (c.motivo ?? null) : null;

  const hubo = await db.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: {
        id: usuarioId,
        rol: "agente",
        activo: true,
        estadoAsesor: c.soloSiEstaba ? { in: c.soloSiEstaba.filter((e) => e !== c.estado) } : { not: c.estado },
        ...(c.sinSenalAntesDe ? { OR: [{ ultimaSenal: null }, { ultimaSenal: { lt: c.sinSenalAntesDe } }] } : {}),
      },
      data: { estadoAsesor: c.estado, estadoDesde: ahora, motivoPausa: motivo, ...(c.estado === "desconectado" ? {} : { ultimaSenal: ahora }) },
    });
    if (r.count === 0) return false;
    await tx.historialEstadoAsesor.updateMany({ where: { usuarioId, fin: null }, data: { fin: ahora } });
    await tx.historialEstadoAsesor.create({ data: { usuarioId, estado: c.estado, motivo, origen: c.origen, cambiadoPorId: c.cambiadoPorId ?? null, inicio: ahora } });
    return true;
  });

  if (hubo && c.estado === "disponible") await procesarCola();
  return hubo;
}

/** Al iniciar sesión el asesor queda Disponible. */
export const alIniciarSesion = (usuarioId: string) => cambiarEstadoAsesor(usuarioId, { estado: "disponible", origen: "inicio_sesion" });

/** Cerrar sesión lo pasa a Desconectado. */
export const alCerrarSesion = (usuarioId: string) => cambiarEstadoAsesor(usuarioId, { estado: "desconectado", origen: "cierre_sesion" });

/**
 * Latido: lo manda la barra lateral cada pocos segundos mientras la app está abierta.
 * Guarda la señal de cualquier usuario y, si un asesor estaba Desconectado, lo vuelve a poner Disponible
 * (la sesión sigue válida: abrió otra vez la app).
 */
export async function registrarLatido(u: { id: string; rol: "admin" | "agente" }, ahora = new Date()) {
  await db.user.update({ where: { id: u.id }, data: { ultimaSenal: ahora } });
  if (u.rol === "agente") await cambiarEstadoAsesor(u.id, { estado: "disponible", origen: "latido", ahora, soloSiEstaba: ["desconectado"] });
}

export async function pausar(usuarioId: string, motivo: MotivoPausa | null, ahora = new Date()) {
  return cambiarEstadoAsesor(usuarioId, { estado: "en_pausa", motivo, origen: "manual", ahora, soloSiEstaba: ["disponible"] });
}

export async function activar(usuarioId: string, ahora = new Date()) {
  return cambiarEstadoAsesor(usuarioId, { estado: "disponible", origen: "manual", ahora, soloSiEstaba: ["en_pausa", "desconectado"] });
}

const ENTRE_CORRIDAS_MS = 30_000;
let ultimaCorrida = 0;

/**
 * Pasa a Desconectado a los asesores que llevan 5 minutos sin latido (también si estaban en pausa).
 * Barata e idempotente: la llama el cron (POST /api/tareas/desconectar-asesores) y, de forma oportunista,
 * cada latido (como máximo cada 30 s en el mismo proceso, salvo que se pida `forzar`).
 * Devuelve a cuántos desconectó.
 */
export async function desconectarInactivos(o: { ahora?: Date; forzar?: boolean; /** Solo estos usuarios (para las pruebas). */ soloEstos?: string[] } = {}): Promise<number> {
  const ahora = o.ahora ?? new Date();
  if (!o.forzar && Date.now() - ultimaCorrida < ENTRE_CORRIDAS_MS) return 0;
  ultimaCorrida = Date.now();

  const limite = new Date(ahora.getTime() - SIN_SENAL_MS);
  const candidatos = await db.user.findMany({
    where: { rol: "agente", estadoAsesor: { not: "desconectado" }, OR: [{ ultimaSenal: null }, { ultimaSenal: { lt: limite } }], ...(o.soloEstos ? { id: { in: o.soloEstos } } : {}) },
    select: { id: true },
  });
  let n = 0;
  for (const u of candidatos) {
    if (await cambiarEstadoAsesor(u.id, { estado: "desconectado", origen: "sin_senal", ahora, soloSiEstaba: ["disponible", "en_pausa"], sinSenalAntesDe: limite })) n++;
  }
  return n;
}

export const disponibilidadDe = (u: { rol: "admin" | "agente"; estadoAsesor: EstadoAsesor; estadoDesde: Date; motivoPausa: string | null }): Disponibilidad | null =>
  u.rol === "agente" ? { estado: u.estadoAsesor, desde: u.estadoDesde.toISOString(), motivo: u.motivoPausa } : null;
