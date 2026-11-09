import { vistaPrevia } from "@/lib/bandeja";
import type { Channel } from "@/lib/canales/tipos";
import { db } from "@/lib/db";
import { comprasDeContacto } from "@/lib/pedidos/compras";
import { filtroContacto, filtroConversacion, filtroPedido, restringido, type Actor } from "@/lib/visibilidad";
import type { Prisma } from "@/generated/prisma/client";
import type { ContactoDetalle, ContactoMini, FilaContacto, FiltrosContactos } from "@/lib/contactos-tipos";
import { veTodo } from "@/lib/permisos";

export const POR_PAGINA = 20;

/** Condición de búsqueda por nombre, correo o teléfono (los dígitos se buscan dentro del número guardado). */
const coincide = (q: string): Prisma.ContactWhereInput => {
  const t = q.trim();
  if (!t) return {};
  const digitos = t.replace(/\D/g, "");
  return {
    OR: [
      { nombre: { contains: t, mode: "insensitive" } },
      { correo: { contains: t, mode: "insensitive" } },
      ...(digitos.length >= 3 ? [{ telefono: { contains: digitos } }] : []),
    ],
  };
};

export async function listarContactos(f: FiltrosContactos, u: Actor): Promise<{ filas: FilaContacto[]; total: number; paginas: number }> {
  const delAsesor: Prisma.ContactWhereInput = veTodo(u) ? (f.asesor === "sin" ? { asesorResponsableId: null } : f.asesor !== "todos" ? { asesorResponsableId: f.asesor } : {}) : {};
  const todos = await db.contact.findMany({
    where: {
      AND: [await filtroContacto(u), delAsesor, coincide(f.q), f.etiquetaId ? { etiquetas: { some: { id: f.etiquetaId } } } : {}, f.canal !== "todos" ? { identidades: { some: { canal: f.canal } } } : {}],
    },
    select: {
      id: true, nombre: true, telefono: true,
      etiquetas: { select: { id: true, nombre: true, color: true }, orderBy: { nombre: "asc" } },
      identidades: { select: { canal: true } },
      conversaciones: { select: { lastMessageAt: true }, where: await filtroConversacion(u) }, // el último contacto cuenta solo lo que la persona ve
    },
  });

  // ponytail: se ordena y pagina en memoria. Alcanza para unos miles de contactos; con más,
  // guardar el último contacto en la tabla de contactos y ordenar en la base.
  const filas: FilaContacto[] = todos.map((c) => {
    const ultimo = c.conversaciones.reduce<Date | null>((m, v) => (!m || v.lastMessageAt > m ? v.lastMessageAt : m), null);
    return {
      id: c.id, nombre: c.nombre, telefono: c.telefono, etiquetas: c.etiquetas,
      canales: [...new Set(c.identidades.map((i) => i.canal as Channel))],
      ultimoContacto: ultimo?.toISOString() ?? null,
    };
  });
  const signo = f.orden.dir === "asc" ? 1 : -1;
  filas.sort((a, b) =>
    f.orden.clave === "nombre"
      ? a.nombre.localeCompare(b.nombre, "es") * signo
      : // Sin conversaciones va siempre al final.
        (a.ultimoContacto === null ? 1 : b.ultimoContacto === null ? -1 : (a.ultimoContacto < b.ultimoContacto ? -1 : 1) * signo),
  );

  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, f.pagina), paginas);
  return { filas: filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), total: filas.length, paginas };
}

export async function buscarContactos(q: string, u: Actor, excluirId?: string): Promise<ContactoMini[]> {
  return db.contact.findMany({
    where: { AND: [await filtroContacto(u), coincide(q), excluirId ? { id: { not: excluirId } } : {}] },
    orderBy: { nombre: "asc" },
    take: 8,
    select: { id: true, nombre: true, telefono: true },
  });
}

export async function cargarContacto(id: string, u: Actor): Promise<ContactoDetalle | null> {
  const c = await db.contact.findFirst({
    where: { id, ...(await filtroContacto(u)) },
    include: {
      etiquetas: { orderBy: { nombre: "asc" } },
      identidades: true,
      conversaciones: { where: await filtroConversacion(u), orderBy: { lastMessageAt: "desc" }, include: { mensajes: { orderBy: { fecha: "desc" }, take: 1, select: { texto: true, tipo: true, direccion: true } } } },
    },
  });
  if (!c) return null;
  const propias = new Set(c.etiquetas.map((t) => t.id));
  return {
    id: c.id, nombre: c.nombre, telefono: c.telefono, correo: c.correo, notas: c.notas,
    etiquetas: c.etiquetas,
    identidades: c.identidades.map((i) => ({ canal: i.canal as Channel, alias: i.alias, externalContactId: i.externalContactId })),
    etiquetasDisponibles: (await db.tag.findMany({ orderBy: { nombre: "asc" } })).filter((t) => !propias.has(t.id)),
    conversaciones: c.conversaciones.map((v) => ({ id: v.id, canal: v.canal as Channel, estado: v.estado, fecha: v.lastMessageAt.toISOString(), ultimo: vistaPrevia(v.mensajes[0]) })),
    compras: await comprasDeContacto(c.id, await filtroPedido(u)),
  };
}

/**
 * Une dos contactos: todo lo del segundo (canales, conversaciones, etiquetas) pasa al primero,
 * que además completa el teléfono, el correo y las notas que le falten. El segundo se elimina.
 */
export async function unirContactos(conservarId: string, unirId: string, actor: { id: string; nombre: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (conservarId === unirId) return { ok: false, error: "Elija dos contactos distintos." };
  return db.$transaction(async (tx) => {
    const [a, b] = await Promise.all([
      tx.contact.findUnique({ where: { id: conservarId }, include: { etiquetas: true } }),
      tx.contact.findUnique({ where: { id: unirId }, include: { etiquetas: true } }),
    ]);
    if (!a || !b) return { ok: false as const, error: "Uno de los contactos ya no existe." };

    await tx.channelIdentity.updateMany({ where: { contactoId: b.id }, data: { contactoId: a.id } });
    await tx.conversation.updateMany({ where: { contactoId: b.id }, data: { contactoId: a.id } });
    await tx.order.updateMany({ where: { contactoId: b.id }, data: { contactoId: a.id } });
    await tx.cotizacion.updateMany({ where: { contactoId: b.id }, data: { contactoId: a.id } });
    // El teléfono es único: se libera en el contacto que desaparece antes de pasárselo al que se queda.
    if (!a.telefono && b.telefono) await tx.contact.update({ where: { id: b.id }, data: { telefono: null } });
    await tx.contact.update({
      where: { id: a.id },
      data: {
        telefono: a.telefono ?? b.telefono,
        correo: a.correo ?? b.correo,
        notas: [a.notas, b.notas && a.notas !== b.notas ? b.notas : null].filter(Boolean).join("\n\n") || null,
        etiquetas: { connect: b.etiquetas.map((t) => ({ id: t.id })) },
      },
    });
    await tx.activityLog.create({ data: { usuarioId: actor.id, accion: "unir_contactos", entidad: "Contact", entidadId: a.id, detalle: { unido: b.nombre, por: actor.nombre } } });
    await tx.contact.delete({ where: { id: b.id } });
    return { ok: true as const };
  });
}
