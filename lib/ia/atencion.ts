import { obtenerNegocio } from "@/lib/ajustes";
import { adaptador } from "@/lib/canales";
import { db } from "@/lib/db";
import { estaAbierto } from "@/lib/horario";
import { asignarConversacion } from "@/lib/equipo/asignacion";
import { enviarMensaje } from "@/lib/mensajeria";
import { DESCONTADOS } from "@/lib/pedidos/estados";
import { ejecutarAsistente } from "./asistente";
import { estadoPresupuesto, obtenerAjustesIa, type AjustesIa } from "./ajustes-ia";
import { clasificarMotivo } from "./ayudas";
import { textoDerivacion } from "./derivacion";
import { construirSystem } from "./prompt";
import { obtenerProveedor } from "./proveedor";
import { registrarRun } from "./registro";
import { derivacionPrevia, revisarSalida } from "./reglas";
import type { MensajeIa } from "./tipos";
import type { AiProvider } from "./tipos";

const MAX_POR_MINUTO = 4;
const ASESORES_CONECTADOS_MS = 2 * 60_000;

/** Quién está respondiendo. Las personas siempre tienen la última palabra: si una escribe o toma la conversación, el asistente se calla. */
export async function asesoresConectados() {
  return db.user.count({ where: { activo: true, ultimaSenal: { gte: new Date(Date.now() - ASESORES_CONECTADOS_MS) } } });
}

async function puedeAtender(canal: string, ajustes: AjustesIa, negocio: Awaited<ReturnType<typeof obtenerNegocio>>) {
  if (!ajustes.encendido || !ajustes.canales.includes(canal)) return false;
  if ((await estadoPresupuesto()).agotado) return false;
  if (!adaptador(canal as never)) return false; // el canal tiene que poder responder
  if (ajustes.modo === "fuera_de_horario") return !estaAbierto(negocio.horarioSemanal);
  if (ajustes.modo === "sin_asesores") return (await asesoresConectados()) === 0;
  return true;
}

const ESPERANDO = { atendidaPor: "nadie", esperandoAsesorDesde: new Date() } as const;

/** Texto del cliente tal como lo ve el proveedor; solo la conversación actual, nunca notas internas. */
async function construirHistorial(conversacionId: string): Promise<MensajeIa[]> {
  const ms = (await db.message.findMany({ where: { conversacionId }, orderBy: { fecha: "desc" }, take: 14, include: { producto: { select: { nombre: true } } } })).reverse();
  const salida: MensajeIa[] = [];
  for (const m of ms) {
    const role = m.direccion === "entrante" ? "user" : "assistant";
    const texto = m.producto ? `[Se envió la tarjeta del producto: ${m.producto.nombre}]` : m.tipo === "image" ? (m.direccion === "entrante" ? "[El cliente envió una imagen]" : "[Se envió una imagen]") : (m.texto ?? `[${m.tipo}]`);
    const previo = salida.at(-1);
    if (previo && previo.role === role) previo.content += `\n${texto}`;
    else salida.push({ role, content: texto });
  }
  while (salida[0]?.role === "assistant") salida.shift();
  return salida;
}

/** Termina la atención del asistente: avisa al cliente y deja la conversación esperando a una persona. */
async function pasarAAsesor(conversacionId: string, motivo: string, opciones: { texto?: string; aiRunId?: string; sinAviso?: boolean } = {}) {
  if (!opciones.sinAviso) {
    const texto = opciones.texto ?? textoDerivacion(await obtenerNegocio());
    await enviarMensaje({ conversacionId, autor: "asistente", aiRunId: opciones.aiRunId, mensaje: { type: "text", text: texto } });
  }
  await db.$transaction([
    db.conversation.update({ where: { id: conversacionId }, data: { atendidaPor: "nadie", esperandoAsesorDesde: new Date() } }),
    db.activityLog.create({ data: { accion: "asistente_paso", entidad: "Conversation", entidadId: conversacionId, detalle: { motivo } } }),
  ]);
}

async function derivarSinLlamar(conversacionId: string, motivo: string, proveedor: AiProvider) {
  const run = await registrarRun({ conversacionId, tipo: "respuesta", proveedor, resultado: "paso_a_asesor" });
  await pasarAAsesor(conversacionId, motivo, { aiRunId: run.id });
}

const enCurso = new Set<string>();

/**
 * Se llama cada vez que entra un mensaje del cliente. Decide si responde el asistente y, si le toca, responde.
 * Nunca lanza: si algo falla, la conversación queda esperando a una persona.
 */
export async function procesarMensajeEntrante(conversacionId: string) {
  if (enCurso.has(conversacionId)) return;
  enCurso.add(conversacionId);
  try {
    for (let i = 0; i < 3; i++) {
      const ultimaId = await procesar(conversacionId);
      const nuevo = await db.message.findFirst({ where: { conversacionId, direccion: "entrante" }, orderBy: { fecha: "desc" }, select: { id: true } });
      if (!ultimaId || nuevo?.id === ultimaId) break; // si llegó otro mensaje mientras respondía, se atiende también
    }
  } catch (e) {
    console.error(`asistente: ${e instanceof Error ? e.name : "error"}`); // nunca el contenido de los mensajes
    await db.conversation.updateMany({ where: { id: conversacionId, atendidaPor: "asistente" }, data: ESPERANDO }).catch(() => {});
  } finally {
    enCurso.delete(conversacionId);
  }
  // Si quedó para una persona (el asistente pasó la conversación, está apagado o falló) y nadie la tiene, se asigna.
  // Con modo Manual, o sin asesores disponibles, no hace nada: queda en «Sin asignar».
  await asignarConversacion(conversacionId).catch((e) => console.error(`asignación: ${e instanceof Error ? e.name : "error"}`));
}

/** Devuelve el id del mensaje del cliente que atendió, o null si el asistente no tenía que hacer nada. */
async function procesar(conversacionId: string): Promise<string | null> {
  const conv = await db.conversation.findUnique({ where: { id: conversacionId } });
  const ultimo = await db.message.findFirst({ where: { conversacionId, direccion: "entrante" }, orderBy: { fecha: "desc" } });
  if (!conv || !ultimo) return null;

  const [ajustes, negocio] = await Promise.all([obtenerAjustesIa(), obtenerNegocio()]);
  const proveedor = obtenerProveedor();

  if (!conv.motivo && ultimo.tipo === "text" && ultimo.texto) await clasificarMotivo(conv.id, ultimo.texto, proveedor);

  // Una conversación nueva (nadie la ha tomado) pasa al asistente si los ajustes lo permiten; si no, queda esperando asesor.
  let atiende = conv.atendidaPor;
  if (atiende === "nadie" && !conv.esperandoAsesorDesde) {
    if (await puedeAtender(conv.canal, ajustes, negocio)) {
      atiende = "asistente";
      await db.conversation.update({ where: { id: conv.id }, data: { atendidaPor: "asistente" } });
    } else {
      await db.conversation.update({ where: { id: conv.id }, data: { esperandoAsesorDesde: new Date() } });
      return null;
    }
  }
  if (atiende !== "asistente") return null;

  // Apagado o sin presupuesto a mitad de la conversación: queda para una persona, sin mensajes raros al cliente.
  if (!(await puedeAtenderAhora(conv.canal, ajustes))) {
    await db.conversation.update({ where: { id: conv.id }, data: ESPERANDO });
    return ultimo.id;
  }

  // Se presenta como asistente virtual en el primer mensaje de cada conversación.
  if ((await db.message.count({ where: { conversacionId, autor: "asistente" } })) === 0) {
    await enviarMensaje({ conversacionId, autor: "asistente", mensaje: { type: "text", text: ajustes.bienvenida } });
  }

  /* ── Reglas que se cumplen en el código, sin depender del modelo ── */
  const pedidoPendiente = (await db.order.count({ where: { contactoId: conv.contactoId, estado: { in: ["pendiente_pago", "en_revision"] } } })) > 0;
  const previa = derivacionPrevia(ultimo.texto, ultimo.tipo, { pedidoPendiente });
  if (previa) {
    await derivarSinLlamar(conv.id, previa, proveedor);
    return ultimo.id;
  }
  const ultimaPersona = await db.message.findFirst({ where: { conversacionId, autor: "asesor" }, orderBy: { fecha: "desc" }, select: { fecha: true } });
  const corridas = await db.aiRun.findMany({ where: { conversacionId, tipo: "respuesta", creado: { gt: ultimaPersona?.fecha ?? new Date(0) } }, orderBy: { creado: "desc" }, select: { creado: true, sinRespuesta: true } });
  if (corridas.filter((c) => c.creado.getTime() > Date.now() - 60_000).length >= MAX_POR_MINUTO) {
    await derivarSinLlamar(conv.id, "demasiados mensajes seguidos", proveedor);
    return ultimo.id;
  }
  if (corridas.length >= ajustes.limiteRespuestas) {
    await derivarSinLlamar(conv.id, "se llegó al límite de respuestas del asistente", proveedor);
    return ultimo.id;
  }
  if (corridas.length >= 2 && corridas[0]!.sinRespuesta && corridas[1]!.sinRespuesta) {
    await derivarSinLlamar(conv.id, "no logró responder dos veces seguidas", proveedor);
    return ultimo.id;
  }

  /* ── Respuesta del asistente ── */
  const r = await ejecutarAsistente({
    proveedor,
    system: construirSystem({ negocio: negocio.nombre, abierto: estaAbierto(negocio.horarioSemanal) }),
    historial: await construirHistorial(conversacionId),
    contexto: { conversacionId, contactoId: conv.contactoId, sandbox: false },
  });

  const run = await registrarRun({
    conversacionId, tipo: "respuesta", proveedor, uso: r.uso, ms: r.ms, herramientas: r.herramientas, consultado: r.consultado, productos: r.productos,
    resultado: r.error ? "error" : r.derivar ? "paso_a_asesor" : "respondio", sinRespuesta: r.sinRespuesta,
  });
  if (r.mensajesEnviados.length) await db.message.updateMany({ where: { id: { in: r.mensajesEnviados } }, data: { aiRunId: run.id } });

  if (r.error) await pasarAAsesor(conv.id, "error del asistente", { aiRunId: run.id, texto: "Un asesor le responderá en breve." });
  else if (r.derivar) await pasarAAsesor(conv.id, r.derivar, { aiRunId: run.id });
  else if (r.texto) {
    // Regla de salida: nunca afirma un pago confirmado si el cliente no tiene un pedido con pago verificado.
    const pagados = await db.order.count({ where: { contactoId: conv.contactoId, estado: { in: [...DESCONTADOS] } } });
    const salida = revisarSalida(r.texto, pagados > 0);
    const envio = await enviarMensaje({ conversacionId, autor: "asistente", aiRunId: run.id, mensaje: { type: "text", text: salida.texto } });
    if (envio.ok && salida.derivar) {
      await pasarAAsesor(conv.id, salida.derivar, { aiRunId: run.id, sinAviso: true });
      return ultimo.id;
    }
    if (!envio.ok) await pasarAAsesor(conv.id, "no se pudo enviar la respuesta", { sinAviso: true });
  }
  return ultimo.id;
}

async function puedeAtenderAhora(canal: string, ajustes: AjustesIa) {
  return ajustes.encendido && ajustes.canales.includes(canal) && !(await estadoPresupuesto()).agotado;
}

/* ── Acciones de las personas sobre la conversación ── */

/** "Devolver al asistente": la conversación vuelve a él y deja de estar asignada. */
export async function devolverAlAsistente(conversacionId: string, actor: { id: string; nombre: string }) {
  await db.$transaction([
    db.conversation.update({ where: { id: conversacionId }, data: { atendidaPor: "asistente", esperandoAsesorDesde: null, asignadaAId: null } }),
    db.activityLog.create({ data: { usuarioId: actor.id, accion: "asistente_devuelto", entidad: "Conversation", entidadId: conversacionId, detalle: { por: actor.nombre } } }),
  ]);
}

/** Pausar al asistente en una conversación: queda con quien la tenga asignada o, si nadie, esperando asesor. */
export async function pausarAsistente(conversacionId: string, actor: { id: string; nombre: string }) {
  const c = await db.conversation.findUnique({ where: { id: conversacionId }, select: { asignadaAId: true } });
  await db.$transaction([
    db.conversation.update({ where: { id: conversacionId }, data: c?.asignadaAId ? { atendidaPor: "asesor", esperandoAsesorDesde: null } : { atendidaPor: "nadie", esperandoAsesorDesde: new Date() } }),
    db.activityLog.create({ data: { usuarioId: actor.id, accion: "asistente_pausado", entidad: "Conversation", entidadId: conversacionId, detalle: { por: actor.nombre } } }),
  ]);
}
