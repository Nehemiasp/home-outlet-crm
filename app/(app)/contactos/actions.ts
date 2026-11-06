"use server";

import { z } from "zod";
import type { ContactoDetalle, ContactoMini, FilaContacto, FiltrosContactos } from "@/lib/contactos-tipos";
import { CANALES } from "@/lib/canales/tipos";
import { buscarContactos as buscar, cargarContacto, listarContactos as listar, unirContactos as unir } from "@/lib/contactos";
import { db } from "@/lib/db";
import { puedeUnirContactos } from "@/lib/permisos";
import { requireUsuario } from "@/lib/session";
import { puedeVerContacto, restringido } from "@/lib/visibilidad";
import { normalizarTelefono } from "@/lib/telefono";
import type { Rol } from "@/lib/permisos";

type Resultado = { ok: true } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
const id = z.string().min(1).max(40);

const filtros = z.object({
  q: z.string().max(100),
  etiquetaId: z.string().max(40),
  canal: z.enum(["todos", ...CANALES]),
  asesor: z.string().max(40),
  orden: z.object({ clave: z.enum(["nombre", "ultimo"]), dir: z.enum(["asc", "desc"]) }),
  pagina: z.number().int().min(1).max(10_000),
});

export async function listarContactos(f: FiltrosContactos): Promise<{ filas: FilaContacto[]; total: number; paginas: number }> {
  const u = await requireUsuario();
  return listar(filtros.parse(f), u);
}

export async function buscarContactos(q: string, excluirId?: string): Promise<ContactoMini[]> {
  const u = await requireUsuario();
  return buscar(z.string().max(60).parse(q), u, excluirId ? id.parse(excluirId) : undefined);
}

export async function obtenerContacto(contactoId: string): Promise<ContactoDetalle | null> {
  const u = await requireUsuario();
  return cargarContacto(id.parse(contactoId), u);
}

/* ── Crear y editar (agentes y admin) ── */
const datos = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(80),
  telefono: z.string().trim().max(30),
  correo: z.union([z.literal(""), z.string().trim().max(120).pipe(z.email("El correo no tiene un formato válido."))]),
  notas: z.string().trim().max(2000),
});

/** Valida y normaliza; devuelve los datos listos para guardar o el mensaje de error. */
function preparar(entrada: z.input<typeof datos>) {
  const p = datos.safeParse(entrada);
  if (!p.success) return fallo(p.error.issues[0]!.message);
  const telefono = p.data.telefono ? normalizarTelefono(p.data.telefono) : null;
  if (p.data.telefono && !telefono) return fallo("El teléfono no es válido. Use 8 dígitos, por ejemplo 5555 1234.");
  return { ok: true as const, data: { nombre: p.data.nombre, telefono, correo: p.data.correo || null, notas: p.data.notas || null } };
}

const telefonoRepetido = async (e: unknown, telefono: string | null, u: { id: string; rol: Rol }) => {
  if ((e as { code?: string }).code !== "P2002") throw e;
  // A un asesor limitado no se le dice de quién es el contacto repetido: puede ser de otro asesor.
  const otro = telefono && !(await restringido(u)) ? await db.contact.findUnique({ where: { telefono }, select: { nombre: true } }) : null;
  return fallo(`Ya existe un contacto con ese teléfono${otro ? `: ${otro.nombre}` : ""}. Un administrador o un jefe de tienda puede unir los contactos.`);
};

export async function crearContacto(entrada: z.input<typeof datos>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const u = await requireUsuario();
  const p = preparar(entrada);
  if (!p.ok) return p;
  try {
    // Quien lo crea a mano lo sigue viendo aunque todavía no tenga conversaciones.
    const c = await db.contact.create({ data: { ...p.data, creadoPorId: u.rol === "agente" ? u.id : null } });
    return { ok: true, id: c.id };
  } catch (e) {
    return telefonoRepetido(e, p.data.telefono, u);
  }
}

export async function editarContacto(contactoId: string, entrada: z.input<typeof datos>): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await puedeVerContacto(u, id.parse(contactoId)))) return fallo("El contacto no existe.");
  const p = preparar(entrada);
  if (!p.ok) return p;
  try {
    await db.contact.update({ where: { id: id.parse(contactoId) }, data: p.data });
  } catch (e) {
    return telefonoRepetido(e, p.data.telefono, u);
  }
  return { ok: true };
}

export async function cambiarEtiqueta(contactoId: string, etiquetaId: string, poner: boolean): Promise<Resultado> {
  const u = await requireUsuario();
  if (!(await puedeVerContacto(u, id.parse(contactoId)))) return fallo("El contacto no existe.");
  const op = { id: id.parse(etiquetaId) };
  await db.contact.update({ where: { id: id.parse(contactoId) }, data: { etiquetas: poner ? { connect: op } : { disconnect: op } } });
  return { ok: true };
}

/* ── Unir contactos (solo admin) ── */
export async function unirContactos(conservarId: string, unirId: string): Promise<Resultado> {
  const u = await requireUsuario();
  if (!puedeUnirContactos(u)) return fallo("Solo un administrador o un jefe de tienda puede unir contactos.");
  return unir(id.parse(conservarId), id.parse(unirId), u);
}
