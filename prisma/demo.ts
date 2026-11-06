// 90 días de conversaciones de demostración, con respuestas del asistente, pases a asesor y costos, para que los reportes se vean con datos realistas.
import { randomUUID } from "node:crypto";
import { estaAbierto, type HorarioSemanal } from "../lib/horario";
import type { Canal, EstadoConversacion, Motivo, PrismaClient } from "../generated/prisma/client";
import { datosNegocio } from "./semilla-ia";

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const DIAS = 90;
const LANZAMIENTO_ASISTENTE = 60; // hace cuántos días empezó a responder el asistente: antes, todo lo atendían personas

function azar(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nombres = ["Ana", "Carlos", "María", "Luis", "Sofía", "Jorge", "Andrea", "Marvin", "Paola", "Erick", "Daniela", "Walter", "Karla", "Josué", "Rebeca", "Kevin", "Lesly", "Brayan", "Gabriela", "Oscar", "Mónica", "Edgar", "Julissa", "Hugo", "Silvia", "Fredy", "Mirna", "Selvin", "Dina", "Rudy", "Karen", "Elmer", "Wendy", "Byron", "Ligia", "Alex", "Yesenia", "Mynor", "Rosa", "Douglas"];
const apellidos = ["Morales", "Estrada", "Ramírez", "Cho", "Pineda", "Barrios", "López", "Caal", "Castillo", "Salguero", "Ruiz", "Méndez", "Orellana", "Archila", "Tzul", "García", "Hernández", "Pérez", "Martínez", "Cruz", "Ortiz", "Juárez", "Coc", "Pop", "Xol", "Maldonado", "Girón", "Zelada", "Portillo", "Quiñónez"];

const PESOS_CANAL: [Canal, number][] = [["whatsapp", 48], ["instagram", 22], ["tiktok", 17], ["facebook", 13]];
const PESOS_MOTIVO: [Motivo, number][] = [["precio", 28], ["existencia", 24], ["envio", 12], ["horario", 8], ["compra", 14], ["reclamo", 4], ["garantia", 5], ["otro", 5]];
// Horas locales de Guatemala con más mensajes: mañana y primera noche.
const PESOS_HORA = [0.3, 0.2, 0.1, 0.1, 0.2, 0.6, 1.5, 3, 5, 7, 8, 8, 6, 5, 5, 6, 7, 8, 7, 5, 3, 1.5, 0.8, 0.5];

const q = (centavos: number) => "Q" + (centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Prod = { id: string; nombre: string; precio: number; existencia: number };

export async function sembrarDemo(db: PrismaClient, equipo: { id: string; nombre: string }[]) {
  const r = azar(20261102);
  const elegir = <T>(l: readonly T[]) => l[Math.floor(r() * l.length)]!;
  const ponderado = <T>(l: readonly (readonly [T, number])[]) => {
    let x = r() * l.reduce((s, [, p]) => s + p, 0);
    for (const [v, p] of l) if ((x -= p) <= 0) return v;
    return l[0]![0];
  };

  const productos: Prod[] = (await db.product.findMany({ where: { activo: true }, include: { stock: true } })).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, existencia: p.stock.reduce((s, x) => s + x.cantidad, 0) }));
  const horarioSemanal = datosNegocio.horarioSemanal as HorarioSemanal;
  const ahora = Date.now();
  const local = new Date(ahora - 6 * HORA_MS);
  const hoyMedianoche = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 6); // medianoche de hoy en Guatemala, en UTC
  const pideProducto = () => productos[Math.floor(r() ** 1.3 * productos.length)]!;

  /* ── Contactos ── */
  const TOTAL_CONTACTOS = 260;
  const contactos = Array.from({ length: TOTAL_CONTACTOS }, (_, i) => ({ id: randomUUID(), nombre: `${elegir(nombres)} ${elegir(apellidos)}`, telefono: `+5025552${String(1000 + i).padStart(4, "0")}`, notas: "Cliente de demostración." }));
  await db.contact.createMany({ data: contactos });

  const identidades = new Map<string, { contactoId: string; canal: Canal; externalContactId: string; alias: string | null }>();
  const identidad = (c: (typeof contactos)[number], canal: Canal) => {
    const llave = `${c.id}|${canal}`;
    if (!identidades.has(llave)) {
      const usuario = c.nombre.toLowerCase().replace(/[^a-z]/g, "") + c.telefono.slice(-3);
      identidades.set(llave, { contactoId: c.id, canal, externalContactId: canal === "whatsapp" ? c.telefono : `${canal}_${usuario}`, alias: canal === "whatsapp" ? null : `@${usuario}` });
    }
  };

  const conversaciones: Record<string, unknown>[] = [];
  const mensajes: Record<string, unknown>[] = [];
  const corridas: Record<string, unknown>[] = [];
  const registros: Record<string, unknown>[] = [];

  /* ── Textos ── */
  const primerMensaje = (m: Motivo, p: Prod) => {
    switch (m) {
      case "precio": return elegir([`¿Cuánto cuesta ${p.nombre}?`, `Buenas, ¿me dice el precio de ${p.nombre}?`, `Precio de ${p.nombre} por favor`]);
      case "existencia": return elegir([`¿Tienen ${p.nombre}?`, `¿Hay ${p.nombre} disponible?`, `Buenas tardes, ¿les queda ${p.nombre}?`]);
      case "envio": return elegir(["¿Hacen envíos a Morales?", "¿Envían a Los Amates?", "¿Cuánto cuesta el envío a Santo Tomás?", "¿Hacen envíos a Puerto Barrios?"]);
      case "horario": return elegir(["¿A qué hora abren?", "¿Hasta qué hora atienden hoy?", "¿Abren los domingos?"]);
      case "compra": return elegir([`Quiero comprar ${p.nombre}`, `Me interesa apartar ${p.nombre}`, `¿Cómo hago para pagar ${p.nombre}?`]);
      case "reclamo": return elegir([`Mi ${p.nombre} llegó dañado`, `Compré ${p.nombre} y no funciona`, "Tengo un problema con mi pedido"]);
      case "garantia": return elegir([`¿Tiene garantía ${p.nombre}?`, "¿Cuánto dura la garantía?"]);
      default: return elegir(["Buenas tardes", "Hola, ¿me pueden ayudar?", "Hola", "¿Quién ganó el partido?"]);
    }
  };
  const textoAsistente = (m: Motivo, p: Prod) => {
    switch (m) {
      case "precio": case "existencia":
        return { texto: `${p.nombre} cuesta ${q(p.precio)}. ${p.existencia > 0 ? `Tenemos ${p.existencia} unidades disponibles.` : "Por el momento no tiene existencia."}`, herramientas: ["buscar_productos"], consultado: [`Consultó: ${p.nombre}`], productos: [p.id] };
      case "envio": return { texto: "Sí, enviamos a Morales, Los Amates y Santo Tomás de Castilla. El costo depende del municipio y del tamaño del producto.", herramientas: ["buscar_respuesta"], consultado: ["Consultó: preguntas frecuentes (¿Hacen envíos a Morales…?)"], productos: [] };
      case "horario": return { texto: `Nuestro horario es: ${datosNegocio.horario}.`, herramientas: ["datos_negocio"], consultado: ["Consultó: datos del negocio"], productos: [] };
      case "garantia": return { texto: datosNegocio.garantia, herramientas: ["datos_negocio"], consultado: ["Consultó: datos del negocio"], productos: [] };
      default: return { texto: "Hola, ¿en qué le puedo ayudar? Puedo consultar precios, existencias, horarios y envíos.", herramientas: [], consultado: [], productos: [] };
    }
  };
  const textoAsesor = (m: Motivo, p: Prod) => {
    switch (m) {
      case "compra": return elegir(["Con gusto le ayudo con su compra. ¿Prefiere recoger en la tienda o que se lo enviemos?", "Claro, lo tenemos. ¿Se lo aparto?"]);
      case "reclamo": return "Lamento el inconveniente. ¿Me envía una foto y su factura para revisarlo?";
      case "garantia": return "Con la factura se revisa sin problema. ¿Cuándo puede pasar por la tienda?";
      case "precio": return `${p.nombre} cuesta ${q(p.precio)}. Déjeme consultar con el encargado si podemos mejorar el precio.`;
      case "existencia": return `Sí, ${p.nombre} está en ${q(p.precio)}. ¿Le interesa?`;
      case "envio": return "Enviamos a Morales, Los Amates y Santo Tomás. Le confirmo el costo según el producto.";
      case "horario": return `Atendemos ${datosNegocio.horario}.`;
      default: return "Buenas, ¿en qué le puedo ayudar?";
    }
  };
  const seguimientoCliente = () => elegir(["Ok, gracias", "¿Y en la tienda física hay?", "Perfecto, paso hoy", "¿Aceptan tarjeta?", "Muchas gracias", "¿Tienen factura?"]);

  const abierto = (t: number) => estaAbierto(horarioSemanal, new Date(t));
  /** Cuándo responde una persona: pronto si la tienda está abierta; si no, al abrir (aprox. a las 8:00 locales). */
  const respuestaHumana = (t: number) => {
    const minutos = Math.max(1, Math.round(Math.exp(Math.log(10) + r() * 1.4 - 0.4)));
    let t1 = t + minutos * 60_000;
    if (!abierto(t1)) {
      const l = new Date(t1 - 6 * HORA_MS);
      const manana = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + (l.getUTCHours() >= 8 ? 1 : 0), 14); // 8:00 locales
      t1 = manana + Math.round(r() * 40) * 60_000;
    }
    return t1;
  };

  /* ── Una conversación ── */
  let forzado: "esperando" | "asistente" | null = null; // las de hoy: unas esperan asesor y otras las atiende el asistente
  const generar = (k: number, t0: number) => {
      const canal = ponderado(PESOS_CANAL);
      const motivo = forzado === "esperando" ? elegir<Motivo>(["compra", "reclamo", "garantia"]) : forzado === "asistente" ? elegir<Motivo>(["precio", "existencia", "envio"]) : ponderado(PESOS_MOTIVO);
      const prod = pideProducto();
      const cliente = contactos[Math.floor(r() ** 1.6 * contactos.length)]!;
      identidad(cliente, canal);

      const id = randomUUID();
      const msj = (direccion: "entrante" | "saliente", autor: "cliente" | "asesor" | "asistente", texto: string, fecha: number, extra: { asesor?: string; aiRunId?: string } = {}) =>
        mensajes.push({ id: randomUUID(), conversacionId: id, direccion, autor, tipo: "text", texto, fecha: new Date(fecha), estado: direccion === "saliente" ? "leido" : null, enviadoPorId: extra.asesor ?? null, aiRunId: extra.aiRunId ?? null });
      const corrida = (tipo: string, t: number, p: { derivar?: boolean; herramientas?: string[]; consultado?: string[]; productos?: string[] }) => {
        const entrada = tipo === "motivo" ? 150 + Math.floor(r() * 40) : 1800 + Math.floor(r() * 1400);
        const salida = tipo === "motivo" ? 3 : 100 + Math.floor(r() * 180);
        const idCorrida = randomUUID();
        corridas.push({
          id: idCorrida, conversacionId: id, tipo, proveedor: "anthropic", modelo: "claude-haiku-5-5", tokensEntrada: entrada, tokensSalida: salida, costoUsd: (entrada * 1 + salida * 5) / 1_000_000,
          ms: tipo === "motivo" ? 300 + Math.floor(r() * 300) : 700 + Math.floor(r() * 1500), herramientas: p.herramientas ?? [], consultado: p.consultado ?? [], productos: p.productos ?? [],
          resultado: p.derivar ? "paso_a_asesor" : "respondio", sinRespuesta: false, creado: new Date(t),
        });
        return idCorrida;
      };

      const asistido = forzado !== null || k <= LANZAMIENTO_ASISTENTE;
      const derivar = forzado === "esperando" || (forzado === null && asistido && (motivo === "compra" || motivo === "reclamo" || (motivo === "garantia" && r() < 0.4) || (motivo === "precio" && r() < 0.2) || (motivo === "otro" && r() < 0.15)));
      const asesor = elegir(equipo);
      let ultimo = t0;
      let estado: EstadoConversacion = "cerrada";
      let atendidaPor: "asistente" | "asesor" | "nadie" = asistido && !derivar ? "asistente" : "asesor";
      let espera: Date | null = null;
      let asignada: string | null = derivar || !asistido ? asesor.id : null;
      let ultimoEntrante = t0;

      msj("entrante", "cliente", primerMensaje(motivo, prod), t0);
      if (asistido) {
        corrida("motivo", t0 + 1000, {});
        msj("saliente", "asistente", "Hola, soy el asistente virtual de Home Outlet. Puedo ayudarle con precios, existencias, horarios y envíos. Si prefiere hablar con un asesor, escriba *asesor*.", t0 + 4000);
        const t1 = t0 + 7000 + Math.floor(r() * 9000);
        if (derivar) {
          const run = corrida("respuesta", t1, { derivar: true, herramientas: ["pasar_a_asesor"] });
          msj("saliente", "asistente", abierto(t1) ? "Le comunico con un asesor, en un momento le responde." : `En este momento estamos fuera de horario. Atendemos ${datosNegocio.horario}. Un asesor le responderá en cuanto abramos.`, t1, { aiRunId: run });
          registros.push({ id: randomUUID(), accion: "asistente_paso", entidad: "Conversation", entidadId: id, detalle: { motivo: { compra: "quiere comprar o apartar", reclamo: "reclamo o problema con un pedido", garantia: "garantía", precio: "pide descuento", otro: "no logró responder" }[motivo as string] ?? "pidió hablar con una persona" }, fecha: new Date(t1) });
          if (r() < 0.08) corrida("sugerencia", t1 + 120_000, { herramientas: ["buscar_productos"] });
          const t2 = respuestaHumana(t1);
          if (forzado === "esperando" || (k === 1 && t2 > ahora - 2 * HORA_MS && r() < 0.6)) {
            estado = "abierta"; atendidaPor = "nadie"; espera = new Date(t1); asignada = null; // la dejamos esperando asesor
          } else {
            msj("saliente", "asesor", textoAsesor(motivo, prod), t2, { asesor: asesor.id });
            ultimo = t2;
            if (r() < 0.55) {
              const t3 = t2 + (2 + Math.floor(r() * 25)) * 60_000;
              msj("entrante", "cliente", seguimientoCliente(), t3);
              ultimoEntrante = t3;
              const t4 = t3 + (1 + Math.floor(r() * 8)) * 60_000;
              msj("saliente", "asesor", "Con gusto. Aquí estamos para lo que necesite.", t4, { asesor: asesor.id });
              ultimo = t4;
            }
            if (r() < 0.04) corrida("resumen", ultimo + 60_000, {});
          }
        } else {
          const a = textoAsistente(motivo, prod);
          const run = corrida("respuesta", t1, a);
          msj("saliente", "asistente", a.texto, t1, { aiRunId: run });
          ultimo = t1;
          if (r() < 0.3) {
            const t3 = t1 + (1 + Math.floor(r() * 5)) * 60_000;
            const m2 = elegir<Motivo>(["precio", "existencia", "envio", "horario"]);
            const p2 = pideProducto();
            msj("entrante", "cliente", primerMensaje(m2, p2), t3);
            ultimoEntrante = t3;
            const b = textoAsistente(m2, p2);
            const run2 = corrida("respuesta", t3 + 9000, b);
            msj("saliente", "asistente", b.texto, t3 + 9000, { aiRunId: run2 });
            ultimo = t3 + 9000;
          }
          if (r() < 0.4) {
            const t5 = ultimo + (1 + Math.floor(r() * 4)) * 60_000;
            msj("entrante", "cliente", "Muchas gracias", t5);
            ultimoEntrante = t5;
            const run3 = corrida("respuesta", t5 + 6000, {});
            msj("saliente", "asistente", "Con gusto. ¿Le ayudo con algo más?", t5 + 6000, { aiRunId: run3 });
            ultimo = t5 + 6000;
          }
        }
      } else {
        // Antes del asistente: todo lo respondían personas.
        const t1 = respuestaHumana(t0);
        msj("saliente", "asesor", textoAsesor(motivo, prod), t1, { asesor: asesor.id });
        ultimo = t1;
        if (r() < 0.5) {
          const t3 = t1 + (2 + Math.floor(r() * 20)) * 60_000;
          msj("entrante", "cliente", seguimientoCliente(), t3);
          ultimoEntrante = t3;
          msj("saliente", "asesor", "Con gusto. Aquí estamos para lo que necesite.", t3 + 4 * 60_000, { asesor: asesor.id });
          ultimo = t3 + 4 * 60_000;
        }
      }

      if (forzado === "asistente") estado = "abierta"; // la está atendiendo el asistente en este momento
      conversaciones.push({
        id, contactoId: cliente.id, canal, estado, asignadaAId: asignada, lastMessageAt: new Date(Math.max(ultimo, ultimoEntrante)), lastInboundAt: new Date(ultimoEntrante),
        noLeidos: estado === "abierta" && atendidaPor === "nadie" ? 1 : 0, atendidaPor, motivo, esperandoAsesorDesde: espera, creada: new Date(t0),
      });
  };

  /* ── Día por día ── */
  for (let k = DIAS; k >= 1; k--) {
    const inicioDia = hoyMedianoche - k * DIA_MS;
    const diaSemana = (new Date(inicioDia - 6 * HORA_MS).getUTCDay() + 6) % 7; // lunes = 0
    const base = 9 + ((DIAS - k) / DIAS) * 9;
    const n = Math.round(base * (diaSemana === 6 ? 0.5 : diaSemana === 5 ? 1.1 : 1) * (0.75 + r() * 0.5));
    for (let c = 0; c < n; c++) {
      const hora = ponderado(PESOS_HORA.map((p, h) => [h, p] as const));
      const t0 = inicioDia + hora * HORA_MS + Math.floor(r() * 3600) * 1000;
      if (t0 <= ahora) generar(k, t0);
    }
  }

  // Hoy, en las últimas horas: así la bandeja tiene conversaciones esperando asesor y otras con el asistente.
  const hoy = ["esperando", "esperando", "esperando", "esperando", "asistente", "asistente", "asistente"] as const;
  for (const [i, modo] of hoy.entries()) {
    forzado = modo;
    generar(0, ahora - (14 + i * 23) * 60_000);
  }
  forzado = null;

  const lotes = async <T>(filas: T[], insertar: (lote: T[]) => Promise<unknown>, tamano = 1000) => {
    for (let i = 0; i < filas.length; i += tamano) await insertar(filas.slice(i, i + tamano));
  };
  await db.channelIdentity.createMany({ data: [...identidades.values()], skipDuplicates: true });
  await lotes(conversaciones, (l) => db.conversation.createMany({ data: l as never }));
  await lotes(corridas, (l) => db.aiRun.createMany({ data: l as never }));
  await lotes(mensajes, (l) => db.message.createMany({ data: l as never }));
  await lotes(registros, (l) => db.activityLog.createMany({ data: l as never }));
  console.log(`Demostración: ${contactos.length} contactos, ${conversaciones.length} conversaciones, ${mensajes.length} mensajes y ${corridas.length} llamadas al asistente en ${DIAS} días.`);
}
