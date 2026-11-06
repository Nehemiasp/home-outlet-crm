import { db } from "@/lib/db";
import { olvidarAjustesEquipo } from "@/lib/equipo/ajustes";
import type { EstadoAsesor } from "@/generated/prisma/client";
import type { Rol } from "@/lib/permisos";

/** Utilidades de las pruebas del equipo. No es una prueba: el nombre no termina en .test.ts. */

export const PREFIJO = "PRUEBA-EQ";

export const crearUsuario = (clave: string, rol: Rol = "agente", estado: EstadoAsesor = "disponible") =>
  db.user.create({ data: { nombre: `${PREFIJO} ${clave}`, correo: `${clave}@prueba-eq.test`, passwordHash: "x", rol, estadoAsesor: estado, ultimaSenal: new Date() } });

let guardados: { id: string; estadoAsesor: EstadoAsesor; estadoDesde: Date; motivoPausa: string | null; activo: boolean }[] = [];
let ajustesPrevios: { modoAsignacion: "manual" | "automatica"; asesoresVenSoloSuyas: boolean } | null = null;

/**
 * Deja a los asesores de la base (los de demostración) desactivados y Desconectados mientras corren las pruebas, para que el
 * reparto solo considere a los de prueba (aunque alguien tenga la aplicación abierta con esa cuenta, su latido no los revive),
 * y fija los ajustes del equipo. `restaurar()` lo devuelve todo como estaba.
 */
export async function aislar(ajustes: { modoAsignacion?: "manual" | "automatica"; asesoresVenSoloSuyas?: boolean } = {}) {
  guardados = await db.user.findMany({ where: { rol: "agente", NOT: { correo: { endsWith: "@prueba-eq.test" } } }, select: { id: true, estadoAsesor: true, estadoDesde: true, motivoPausa: true, activo: true } });
  await db.user.updateMany({ where: { id: { in: guardados.map((g) => g.id) } }, data: { estadoAsesor: "desconectado", activo: false } });
  const f = await db.ajustesEquipo.upsert({ where: { id: "equipo" }, update: {}, create: { id: "equipo" } });
  ajustesPrevios = { modoAsignacion: f.modoAsignacion, asesoresVenSoloSuyas: f.asesoresVenSoloSuyas };
  await db.ajustesEquipo.update({ where: { id: "equipo" }, data: { modoAsignacion: "automatica", asesoresVenSoloSuyas: true, ...ajustes } });
  olvidarAjustesEquipo();
}

export async function fijarAjustes(a: { modoAsignacion?: "manual" | "automatica"; asesoresVenSoloSuyas?: boolean }) {
  await db.ajustesEquipo.update({ where: { id: "equipo" }, data: a });
  olvidarAjustesEquipo();
}

export async function restaurar() {
  for (const g of guardados) await db.user.update({ where: { id: g.id }, data: { estadoAsesor: g.estadoAsesor, estadoDesde: g.estadoDesde, motivoPausa: g.motivoPausa, activo: g.activo } });
  if (ajustesPrevios) await db.ajustesEquipo.update({ where: { id: "equipo" }, data: ajustesPrevios });
  olvidarAjustesEquipo();
  guardados = [];
  ajustesPrevios = null;
}

/** Borra todo lo que crearon las pruebas (usuarios, contactos, conversaciones y pedidos con el prefijo). */
export async function limpiar() {
  const contactos = await db.contact.findMany({ where: { nombre: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = contactos.map((c) => c.id);
  await db.order.deleteMany({ where: { contactoId: { in: ids } } });
  await db.conversation.deleteMany({ where: { contactoId: { in: ids } } });
  await db.contact.deleteMany({ where: { id: { in: ids } } });
  await db.activityLog.deleteMany({ where: { usuario: { correo: { endsWith: "@prueba-eq.test" } } } });
  await db.user.deleteMany({ where: { correo: { endsWith: "@prueba-eq.test" } } });
}

let n = 0;
/** Un contacto con su conversación abierta, esperando asesor (como la deja el asistente al pasarla). */
export async function conversacionEsperando(o: { asesorResponsableId?: string; esperaDesde?: Date; asignadaAId?: string; estado?: "abierta" | "cerrada"; atendidaPor?: "nadie" | "asistente" | "asesor"; canal?: "simulado" | "whatsapp" } = {}) {
  const i = ++n;
  const canal = o.canal ?? "simulado";
  const contacto = await db.contact.create({
    data: { nombre: `${PREFIJO} contacto ${i}`, telefono: `+5025099${String(i).padStart(4, "0")}`, asesorResponsableId: o.asesorResponsableId, identidades: { create: { canal, externalContactId: `+5025099${String(i).padStart(4, "0")}` } } },
  });
  const atendidaPor = o.atendidaPor ?? (o.asignadaAId ? "asesor" : "nadie");
  const conversacion = await db.conversation.create({
    data: {
      contactoId: contacto.id, canal, estado: o.estado ?? "abierta", asignadaAId: o.asignadaAId, atendidaPor,
      esperandoAsesorDesde: atendidaPor === "nadie" ? (o.esperaDesde ?? new Date()) : null, lastInboundAt: new Date(),
    },
  });
  return { contacto, conversacion };
}
