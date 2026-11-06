import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { horarioValido, type HorarioSemanal } from "@/lib/horario";
import { Prisma, type Rol } from "@/generated/prisma/client";
import { textoCuentas, type DatosNegocio } from "@/lib/plantillas";

type Actor = { id: string; nombre: string };
type Resultado = { ok: true } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const log = (actor: Actor, accion: string, entidad: string, entidadId: string, detalle: object) =>
  db.activityLog.create({ data: { usuarioId: actor.id, accion, entidad, entidadId, detalle: { ...detalle, por: actor.nombre } } });

export const TONOS = ["carbon", "naranja", "exito", "aviso", "error", "gris"] as const;

/* ── Usuarios ── */
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const claveTemporal = () => Array.from({ length: 12 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

export const listarUsuarios = () =>
  db.user.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], select: { id: true, nombre: true, correo: true, rol: true, activo: true, puedeVerificarPagos: true } });

/** True si el cambio dejaría al sistema sin ningún administrador activo. */
export const dejaSinAdmin = (adminsActivos: number, quitaAdminActivo: boolean) => quitaAdminActivo && adminsActivos <= 1;

const adminsActivos = () => db.user.count({ where: { rol: "admin", activo: true } });

/** Crea el usuario con una contraseña temporal que se muestra una sola vez. */
export async function crearUsuario(d: { nombre: string; correo: string; rol: Rol }, actor: Actor): Promise<{ ok: true; clave: string } | { ok: false; error: string }> {
  const correo = d.correo.trim().toLowerCase();
  if (await db.user.findUnique({ where: { correo } })) return fallo("Ya existe un usuario con ese correo.");
  const clave = claveTemporal();
  const u = await db.user.create({ data: { nombre: d.nombre.trim(), correo, rol: d.rol, passwordHash: await bcrypt.hash(clave, 10) } });
  await log(actor, "crear_usuario", "User", u.id, { correo, rol: d.rol });
  return { ok: true, clave };
}

export async function cambiarRol(id: string, rol: Rol, actor: Actor): Promise<Resultado> {
  if (id === actor.id) return fallo("No puede cambiar su propio rol. Pídaselo a otro administrador.");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return fallo("El usuario ya no existe.");
  if (u.rol === rol) return { ok: true };
  if (dejaSinAdmin(await adminsActivos(), u.rol === "admin" && u.activo)) return fallo("Debe quedar al menos un administrador activo.");
  await db.user.update({ where: { id }, data: { rol } });
  await log(actor, "cambiar_rol", "User", id, { correo: u.correo, de: u.rol, a: rol });
  return { ok: true };
}

/** Desactivar bloquea la entrada al instante y deja sin asignar sus conversaciones, para que nadie quede esperando. */
export async function cambiarActivo(id: string, activo: boolean, actor: Actor): Promise<Resultado> {
  if (id === actor.id) return fallo("No puede desactivar su propio usuario.");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return fallo("El usuario ya no existe.");
  if (u.activo === activo) return { ok: true };
  if (dejaSinAdmin(await adminsActivos(), !activo && u.rol === "admin")) return fallo("Debe quedar al menos un administrador activo.");
  await db.$transaction([
    db.user.update({ where: { id }, data: { activo } }),
    ...(activo ? [] : [db.conversation.updateMany({ where: { asignadaAId: id }, data: { asignadaAId: null } })]),
    log(actor, activo ? "activar_usuario" : "desactivar_usuario", "User", id, { correo: u.correo }),
  ]);
  return { ok: true };
}

/** Un agente con este permiso confirma o rechaza pagos; un admin siempre puede. */
export async function cambiarPermisoPagos(id: string, puede: boolean, actor: Actor): Promise<Resultado> {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return fallo("El usuario ya no existe.");
  if (u.puedeVerificarPagos === puede) return { ok: true };
  await db.user.update({ where: { id }, data: { puedeVerificarPagos: puede } });
  await log(actor, "permiso_pagos", "User", id, { correo: u.correo, puede });
  return { ok: true };
}

export async function restablecerClave(id: string, actor: Actor): Promise<{ ok: true; clave: string } | { ok: false; error: string }> {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return fallo("El usuario ya no existe.");
  const clave = claveTemporal();
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(clave, 10) } });
  await log(actor, "restablecer_clave", "User", id, { correo: u.correo });
  return { ok: true, clave };
}

/* ── Respuestas rápidas ── */
export const ATAJO_VALIDO = /^\/[a-z0-9-]{1,29}$/;

export const listarRespuestas = () => db.quickReply.findMany({ orderBy: { atajo: "asc" } });

export async function guardarRespuesta(id: string | null, d: { atajo: string; texto: string }): Promise<Resultado> {
  const atajo = d.atajo.trim().toLowerCase();
  const texto = d.texto.trim();
  if (!ATAJO_VALIDO.test(atajo)) return fallo("El atajo empieza con / y lleva solo letras minúsculas, números o guiones, por ejemplo /horario.");
  if (!texto) return fallo("Escriba el texto de la respuesta.");
  if (texto.length > 1000) return fallo("El texto pasa de 1000 caracteres.");
  const repetido = await db.quickReply.findUnique({ where: { atajo } });
  if (repetido && repetido.id !== id) return fallo(`Ya existe una respuesta con el atajo ${atajo}.`);
  if (id) await db.quickReply.update({ where: { id }, data: { atajo, texto } });
  else await db.quickReply.create({ data: { atajo, texto } });
  return { ok: true };
}

export const borrarRespuesta = async (id: string): Promise<Resultado> => (await db.quickReply.deleteMany({ where: { id } }), { ok: true });

/* ── Etiquetas ── */
export const listarEtiquetas = async () => (await db.tag.findMany({ orderBy: { nombre: "asc" }, include: { _count: { select: { contactos: true } } } })).map((t) => ({ id: t.id, nombre: t.nombre, color: t.color, contactos: t._count.contactos }));

export async function guardarEtiqueta(id: string | null, d: { nombre: string; color: string }): Promise<Resultado> {
  const nombre = d.nombre.trim();
  if (!nombre) return fallo("Escriba el nombre de la etiqueta.");
  if (nombre.length > 30) return fallo("El nombre pasa de 30 caracteres.");
  if (!(TONOS as readonly string[]).includes(d.color)) return fallo("Elija uno de los colores de la lista.");
  const repetida = await db.tag.findUnique({ where: { nombre } });
  if (repetida && repetida.id !== id) return fallo(`Ya existe la etiqueta "${nombre}".`);
  if (id) await db.tag.update({ where: { id }, data: { nombre, color: d.color } });
  else await db.tag.create({ data: { nombre, color: d.color } });
  return { ok: true };
}

export const borrarEtiqueta = async (id: string): Promise<Resultado> => (await db.tag.deleteMany({ where: { id } }), { ok: true });

/* ── Datos del negocio ── */
export type NegocioCompleto = DatosNegocio & { horarioSemanal: HorarioSemanal | null };

export async function obtenerNegocio(): Promise<NegocioCompleto> {
  const [n, cuentas] = await Promise.all([db.negocio.upsert({ where: { id: "negocio" }, create: {}, update: {} }), db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }] })]);
  return { nombre: n.nombre, horario: n.horario, direccion: n.direccion, pagos: n.pagos, envios: n.envios, garantia: n.garantia, cuentas: textoCuentas(cuentas), horarioSemanal: horarioValido(n.horarioSemanal) ? n.horarioSemanal : null };
}

export async function guardarNegocio(d: { nombre: string; horario: string; direccion: string; pagos?: string; envios?: string; garantia?: string; horarioSemanal?: HorarioSemanal | null }): Promise<Resultado> {
  const nombre = d.nombre.trim();
  if (!nombre) return fallo("Escriba el nombre del negocio.");
  if (nombre.length > 80 || [d.horario, d.direccion, d.pagos ?? "", d.envios ?? "", d.garantia ?? ""].some((t) => t.length > 1000)) return fallo("Alguno de los textos es demasiado largo.");
  if (d.horarioSemanal !== undefined && d.horarioSemanal !== null && !horarioValido(d.horarioSemanal)) return fallo("Revise el horario por día: la hora de apertura debe ser antes que la de cierre.");
  const vacio = (t?: string) => t?.trim() || null;
  const datos = {
    nombre,
    horario: vacio(d.horario),
    direccion: vacio(d.direccion),
    ...(d.pagos !== undefined ? { pagos: vacio(d.pagos) } : {}),
    ...(d.envios !== undefined ? { envios: vacio(d.envios) } : {}),
    ...(d.garantia !== undefined ? { garantia: vacio(d.garantia) } : {}),
    ...(d.horarioSemanal !== undefined ? { horarioSemanal: d.horarioSemanal ?? Prisma.JsonNull } : {}),
  };
  await db.negocio.upsert({ where: { id: "negocio" }, create: { id: "negocio", ...datos }, update: datos });
  return { ok: true };
}
