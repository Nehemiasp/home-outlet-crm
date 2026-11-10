import { obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { estaAbierto } from "@/lib/horario";
import { textoDerivacion } from "./derivacion";
import { ejecutarAsistente } from "./asistente";
import { estadoPresupuesto } from "./ajustes-ia";
import { construirSystem, SYSTEM_MOTIVO, SYSTEM_RESUMEN } from "./prompt";
import { costoEstimadoUsd, obtenerProveedor } from "./proveedor";
import { registrarRun } from "./registro";
import { motivoPorPalabras } from "./simulado";
import { MOTIVOS, type AiProvider, type MensajeIa, type MotivoIa } from "./tipos";

/** Etiqueta el motivo del primer mensaje del cliente. Si el proveedor falla o responde algo raro, se usan palabras clave. */
export async function clasificarMotivo(conversacionId: string, texto: string, proveedor: AiProvider = obtenerProveedor()): Promise<MotivoIa> {
  let motivo: MotivoIa = motivoPorPalabras(texto);
  try {
    const r = await proveedor.respond({ system: SYSTEM_MOTIVO, messages: [{ role: "user", content: texto.slice(0, 500) }], tools: [], maxTokens: 10, signal: AbortSignal.timeout(10_000) });
    const palabra = (r.text ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if ((MOTIVOS as readonly string[]).includes(palabra)) motivo = palabra as MotivoIa;
    await registrarRun({ conversacionId, tipo: "motivo", proveedor, uso: r.usage, resultado: "respondio" });
  } catch {
    await registrarRun({ conversacionId, tipo: "motivo", proveedor, resultado: "error" });
  }
  await db.conversation.update({ where: { id: conversacionId }, data: { motivo } });
  return motivo;
}

async function historialDe(conversacionId: string): Promise<MensajeIa[]> {
  const ms = (await db.message.findMany({ where: { conversacionId }, orderBy: { fecha: "desc" }, take: 14, include: { producto: { select: { nombre: true } } } })).reverse();
  const out: MensajeIa[] = [];
  for (const m of ms) {
    const role = m.direccion === "entrante" ? "user" : "assistant";
    const t = m.producto ? `[Se envió la tarjeta del producto: ${m.producto.nombre}]` : (m.texto ?? `[${m.tipo}]`);
    if (out.at(-1)?.role === role) out.at(-1)!.content += `\n${t}`;
    else out.push({ role, content: t });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

/** Sugerir respuesta: un borrador para el compositor. Consulta con las mismas herramientas y reglas, pero no envía nada. */
export async function sugerirRespuesta(conversacionId: string): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  if ((await estadoPresupuesto()).agotado) return { ok: false, error: "El presupuesto mensual del asistente se agotó." };
  const conv = await db.conversation.findUnique({ where: { id: conversacionId }, select: { contactoId: true } });
  if (!conv) return { ok: false, error: "La conversación no existe." };
  const [negocio, historial] = await Promise.all([obtenerNegocio(), historialDe(conversacionId)]);
  if (historial.length === 0) return { ok: false, error: "Todavía no hay mensajes del cliente a los que responder." };
  const proveedor = obtenerProveedor();
  const r = await ejecutarAsistente({
    proveedor, historial, soloLectura: true,
    system: construirSystem({ negocio: negocio.nombre, abierto: estaAbierto(negocio.horarioSemanal), sugerencia: true }),
    contexto: { conversacionId, contactoId: conv.contactoId, sandbox: true },
  });
  await registrarRun({ conversacionId, tipo: "sugerencia", proveedor, uso: r.uso, ms: r.ms, herramientas: r.herramientas, consultado: r.consultado, productos: r.productos, resultado: r.error ? "error" : "respondio", sinRespuesta: r.sinRespuesta });
  if (r.error || !r.texto) return { ok: false, error: "No se pudo preparar una sugerencia. Intente de nuevo en un momento." };
  return { ok: true, texto: r.texto };
}

/** Resumen de 3 a 5 líneas de la conversación, guardado con su fecha. Regenerar crea uno nuevo. */
export async function resumirConversacion(conversacionId: string, usuarioId: string): Promise<{ ok: true; texto: string; creado: Date } | { ok: false; error: string }> {
  if ((await estadoPresupuesto()).agotado) return { ok: false, error: "El presupuesto mensual del asistente se agotó." };
  const conv = await db.conversation.findUnique({ where: { id: conversacionId }, select: { atendidaPor: true, esperandoAsesorDesde: true } });
  if (!conv) return { ok: false, error: "La conversación no existe." };
  const ms = (await db.message.findMany({ where: { conversacionId }, orderBy: { fecha: "desc" }, take: 40, include: { producto: { select: { nombre: true } } } })).reverse();
  if (ms.length === 0) return { ok: false, error: "La conversación todavía no tiene mensajes." };

  const quien = (m: (typeof ms)[number]) => (m.direccion === "entrante" ? "Cliente" : m.autor === "asistente" ? "Asistente" : "Asesor");
  const estado = conv.atendidaPor === "asistente" ? "la atiende el asistente" : conv.atendidaPor === "asesor" ? "la atiende un asesor" : conv.esperandoAsesorDesde ? "esperando asesor" : "sin atender";
  const transcripcion = [`ESTADO: ${estado}`, ...ms.map((m) => (m.producto ? `${quien(m)}: [Producto enviado: ${m.producto.nombre}]` : `${quien(m)}: ${m.texto ?? `[${m.tipo}]`}`))].join("\n");

  const proveedor = obtenerProveedor();
  try {
    const r = await proveedor.respond({ system: SYSTEM_RESUMEN, messages: [{ role: "user", content: transcripcion }], tools: [], maxTokens: 300, signal: AbortSignal.timeout(20_000) });
    const texto = r.text?.trim();
    if (!texto) throw new Error("vacío");
    await registrarRun({ conversacionId, tipo: "resumen", proveedor, uso: r.usage, resultado: "respondio" });
    const guardado = await db.conversationSummary.create({ data: { conversacionId, texto, generadoPorId: usuarioId } });
    return { ok: true, texto, creado: guardado.creado };
  } catch {
    await registrarRun({ conversacionId, tipo: "resumen", proveedor, resultado: "error" });
    return { ok: false, error: "No se pudo generar el resumen. Intente de nuevo en un momento." };
  }
}

/** Pantalla de prueba: un turno del asistente sin crear conversaciones ni mandar mensajes. Queda en el registro de costos. */
export async function probarAsistente(historial: MensajeIa[]) {
  const proveedor = obtenerProveedor();
  const negocio = await obtenerNegocio();
  const r = await ejecutarAsistente({
    proveedor, historial,
    system: construirSystem({ negocio: negocio.nombre, abierto: estaAbierto(negocio.horarioSemanal) }),
    contexto: { conversacionId: null, contactoId: null, sandbox: true },
  });
  await registrarRun({ conversacionId: null, tipo: "prueba", proveedor, uso: r.uso, ms: r.ms, herramientas: r.herramientas, consultado: r.consultado, productos: r.productos, resultado: r.error ? "error" : r.derivar ? "paso_a_asesor" : "respondio", sinRespuesta: r.sinRespuesta });
  // Las tarjetas que habría recibido el cliente, para dibujarlas en la pantalla de prueba como en la conversación.
  const ids = [...new Set(r.tarjetas.map((t) => t.productoId))];
  const datos = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, sku: true, precio: true } }) : [];
  const tarjetas = r.tarjetas.flatMap((t) => {
    const p = datos.find((d) => d.id === t.productoId);
    return p ? [{ nombre: p.nombre, sku: p.sku, precioCentavos: p.precio, fotos: t.fotos }] : [];
  });
  return { ...r, tarjetas, proveedor: proveedor.name, modelo: proveedor.modelo, costoUsd: costoEstimadoUsd(proveedor.name, r.uso), textoDerivacion: textoDerivacion(negocio) };
}
