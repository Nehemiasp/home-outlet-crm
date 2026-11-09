"use server";

import { z } from "zod";
import * as ajustes from "@/lib/ajustes";
import { guardarAjustesEquipo as guardarEquipo } from "@/lib/equipo/ajustes";
import { guardarAjustesIa } from "@/lib/ia/ajustes-ia";
import { probarAsistente } from "@/lib/ia/ayudas";
import * as preguntas from "@/lib/ia/preguntas";
import * as pedidos from "@/lib/pedidos/ajustes";
import { puedeVerAjustes, ROLES } from "@/lib/permisos";
import { requireUsuario } from "@/lib/session";

type Resultado = { ok: true } | { ok: false; error: string };
type ConClave = { ok: true; clave: string } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
const id = z.string().min(1).max(40);
const primerError = (e: z.ZodError) => e.issues[0]!.message;

/** Todo lo de Ajustes es solo para administradores, y se vuelve a comprobar en cada acción. */
async function admin() {
  const u = await requireUsuario();
  return puedeVerAjustes(u) ? u : null;
}
const SOLO_ADMIN = fallo("Solo un administrador puede hacer esto.");

/* ── Equipo ── */
const ajustesEquipo = z.object({ modoAsignacion: z.enum(["manual", "automatica"]), asesoresVenSoloSuyas: z.boolean() }).partial();

export async function guardarAjustesEquipo(entrada: z.input<typeof ajustesEquipo>): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = ajustesEquipo.safeParse(entrada);
  if (!p.success) return fallo("Revise los ajustes.");
  await guardarEquipo(p.data, u);
  return { ok: true };
}

/* ── Usuarios ── */
const usuario = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(80, "El nombre pasa de 80 caracteres."),
  correo: z.string().trim().toLowerCase().pipe(z.email("El correo no tiene un formato válido.")),
  rol: z.enum(ROLES),
});

export async function invitarUsuario(entrada: z.input<typeof usuario>): Promise<ConClave> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = usuario.safeParse(entrada);
  if (!p.success) return fallo(primerError(p.error));
  return ajustes.crearUsuario(p.data, u);
}

export async function cambiarRol(usuarioId: string, rol: string): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return ajustes.cambiarRol(id.parse(usuarioId), z.enum(ROLES).parse(rol), u);
}

export async function cambiarActivo(usuarioId: string, activo: boolean): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return ajustes.cambiarActivo(id.parse(usuarioId), activo, u);
}

export async function cambiarPermisoVerificarPagos(usuarioId: string, puede: boolean): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return ajustes.cambiarPermisoPagos(id.parse(usuarioId), z.boolean().parse(puede), u);
}

export async function quitarSegundoFactor(usuarioId: string): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return ajustes.quitarSegundoFactor(id.parse(usuarioId), u);
}

export async function restablecerClave(usuarioId: string): Promise<ConClave> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return ajustes.restablecerClave(id.parse(usuarioId), u);
}

/* ── Respuestas rápidas ── */
const respuesta = z.object({ atajo: z.string().max(40), texto: z.string().max(2000) });

export async function guardarRespuesta(respuestaId: string | null, entrada: z.input<typeof respuesta>): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  const p = respuesta.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de la respuesta.");
  return ajustes.guardarRespuesta(respuestaId ? id.parse(respuestaId) : null, p.data);
}

export async function borrarRespuesta(respuestaId: string): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  return ajustes.borrarRespuesta(id.parse(respuestaId));
}

/* ── Etiquetas ── */
const etiqueta = z.object({ nombre: z.string().max(60), color: z.string().max(20) });

export async function guardarEtiqueta(etiquetaId: string | null, entrada: z.input<typeof etiqueta>): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  const p = etiqueta.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de la etiqueta.");
  return ajustes.guardarEtiqueta(etiquetaId ? id.parse(etiquetaId) : null, p.data);
}

export async function borrarEtiqueta(etiquetaId: string): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  return ajustes.borrarEtiqueta(id.parse(etiquetaId));
}

/* ── Datos del negocio ── */
const dia = z.object({ abre: z.string().max(5), cierra: z.string().max(5) }).nullable();
const negocio = z.object({
  nombre: z.string().max(200),
  horario: z.string().max(1000),
  direccion: z.string().max(1000),
  pagos: z.string().max(1000),
  envios: z.string().max(1000),
  garantia: z.string().max(1000),
  horarioSemanal: z.array(dia).length(7).nullable(),
});

export async function guardarNegocio(entrada: z.input<typeof negocio>): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  const p = negocio.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos del negocio.");
  return ajustes.guardarNegocio(p.data);
}

/* ── Pagos y envíos ── */
const ajustesPedidos = z.object({
  prefijo: z.string().max(10),
  horasReserva: z.number().int(),
  diasCotizacion: z.number().int(),
  paqueterias: z.array(z.string().max(60)).max(20),
  descuentoMaxAgente: z.number().int(),
  inventario: z.enum(["separado", "compartido"]),
  metodos: z.array(z.string().max(30)).max(10),
  envioGratisDesde: z.string().max(20),
  ubicacionRecogerId: id.nullable(),
  ubicacionEnvioId: id.nullable(),
});

export async function guardarAjustesDePedidos(entrada: z.input<typeof ajustesPedidos>): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = ajustesPedidos.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de los pedidos.");
  return pedidos.guardarAjustesPedidos(p.data, u);
}

const mensajes = z.record(z.string().max(40), z.object({ activo: z.boolean(), texto: z.string().max(2000) }));

export async function guardarMensajesPedidos(entrada: z.input<typeof mensajes>): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = mensajes.safeParse(entrada);
  if (!p.success) return fallo("Revise los mensajes.");
  return pedidos.guardarMensajes(p.data, u);
}

const cuenta = z.object({ banco: z.string().max(100), tipo: z.enum(["monetaria", "ahorro"]), numero: z.string().max(60), titular: z.string().max(120), activa: z.boolean() });

export async function guardarCuentaBancaria(cuentaId: string | null, entrada: z.input<typeof cuenta>): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = cuenta.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de la cuenta.");
  return pedidos.guardarCuenta(cuentaId ? id.parse(cuentaId) : null, p.data, u);
}

export async function borrarCuentaBancaria(cuentaId: string): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return pedidos.borrarCuenta(id.parse(cuentaId), u);
}

const zona = z.object({ nombre: z.string().max(100), departamentos: z.array(z.string().max(60)).max(30), municipios: z.array(z.string().max(80)).max(400), costo: z.string().max(20), tiempo: z.string().max(100), activa: z.boolean() });

export async function guardarZonaEnvio(zonaId: string | null, entrada: z.input<typeof zona>): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  const p = zona.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de la zona.");
  return pedidos.guardarZona(zonaId ? id.parse(zonaId) : null, p.data, u);
}

export async function borrarZonaEnvio(zonaId: string): Promise<Resultado> {
  const u = await admin();
  if (!u) return SOLO_ADMIN;
  return pedidos.borrarZona(id.parse(zonaId), u);
}

/* ── Asistente ── */
const ajustesIa = z.object({
  encendido: z.boolean(),
  canales: z.array(z.string().max(20)).max(10),
  modo: z.enum(["siempre", "fuera_de_horario", "sin_asesores"]),
  bienvenida: z.string().max(2000),
  limiteRespuestas: z.number().int(),
  presupuestoMensualUsd: z.number().nullable(),
});

export async function guardarAsistente(entrada: z.input<typeof ajustesIa>): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  const p = ajustesIa.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos del asistente.");
  return guardarAjustesIa(p.data);
}

const pregunta = z.object({ pregunta: z.string().max(600), respuesta: z.string().max(2000), categoria: z.string().max(60), activa: z.boolean() });

export async function guardarPregunta(preguntaId: string | null, entrada: z.input<typeof pregunta>): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  const p = pregunta.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos de la pregunta.");
  return preguntas.guardarPregunta(preguntaId ? id.parse(preguntaId) : null, p.data);
}

export async function borrarPregunta(preguntaId: string): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  return preguntas.borrarPregunta(id.parse(preguntaId));
}

export async function alternarPregunta(preguntaId: string, activa: boolean): Promise<Resultado> {
  if (!(await admin())) return SOLO_ADMIN;
  return preguntas.alternarPregunta(id.parse(preguntaId), activa);
}

/** Un turno del chat de prueba. El historial lo arma la pantalla; nada de esto crea conversaciones. */
export async function probar(historial: { role: "user" | "assistant"; content: string }[]) {
  if (!(await admin())) return null;
  const h = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).min(1).max(30).safeParse(historial);
  if (!h.success || h.data.at(-1)?.role !== "user") return null;
  return probarAsistente(h.data);
}
