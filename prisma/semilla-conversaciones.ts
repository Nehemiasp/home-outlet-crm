// Las conversaciones de prueba «a mano» (15 contactos y 20 conversaciones) y el reparto final entre los asesores.
// Separado de seed.ts para poder rehacer solo la demostración sin tocar usuarios ni ajustes. TODO es ficticio.
import type { Canal, EstadoConversacion, PrismaClient } from "../generated/prisma/client";

const hace = (horas: number) => new Date(Date.now() - horas * 3600_000);

const nombres = [
  "Ana Lucía Morales", "Carlos Estrada", "María José Ramírez", "Luis Fernando Cho", "Sofía Pineda",
  "Jorge Barrios", "Andrea López", "Marvin Caal", "Paola Castillo", "Erick Salguero",
  "Daniela Ruiz", "Walter Méndez", "Karla Orellana", "Josué Archila", "Rebeca Tzul",
];

type Linea = ["in" | "out", string];
const guiones: Linea[][] = [
  [["in", "¿Tienen todavía la pantalla para carro?"], ["out", "Buenas tardes. Déjeme confirmar la existencia."], ["in", "Gracias, ¿cuánto cuesta?"]],
  [["in", "¿Cuál es el horario?"], ["out", "Atendemos de lunes a sábado de 8:00 a 18:00 y domingo de 9:00 a 13:00."]],
  [["in", "¿Hacen envíos a Morales?"], ["in", "Lo necesito para esta semana"]],
  [["in", "Hola, buenas"], ["in", "¿Tienen licuadoras?"]],
  [["in", "¿Aceptan tarjeta?"], ["out", "Aceptamos transferencia y depósito bancario, efectivo en la tienda, pago contra entrega y Visacuotas (tarjeta Visa en cuotas)."], ["in", "Perfecto, gracias"]],
  [["in", "¿Los artículos electrónicos tienen garantía?"], ["out", "Los artículos electrónicos tienen 30 días de garantía contra defectos de fábrica."]],
  [["in", "Buenos días, ¿dónde están ubicados?"], ["out", "Estamos en la 7a. avenida y 10a. calle, zona 1, Puerto Barrios, frente al parque."], ["in", "Gracias"]],
  [["in", "¿Tienen el organizador de maletero?"], ["out", "Sí, nos quedan pocas unidades."], ["in", "Me lo reserva, por favor"]],
];

// [contacto, canal, estado, asignada a, horas desde el último mensaje, guion]
const conversaciones: [number, Canal, EstadoConversacion, "admin" | "agente" | null, number, number][] = [
  [0, "whatsapp", "abierta", null, 0.2, 0], [1, "whatsapp", "abierta", null, 0.5, 2], [2, "simulado", "abierta", "agente", 1, 3],
  [3, "simulado", "abierta", null, 1.5, 7], [4, "tiktok", "abierta", "agente", 2.5, 1], [5, "simulado", "abierta", "admin", 3, 4],
  [6, "whatsapp", "abierta", null, 5, 5], [7, "instagram", "abierta", null, 22, 6], [8, "simulado", "pendiente", "agente", 8, 7],
  [9, "whatsapp", "pendiente", "admin", 12, 0], [10, "simulado", "pendiente", "agente", 20, 1], [11, "facebook", "pendiente", null, 26, 2],
  [12, "simulado", "pendiente", "agente", 30, 3], [13, "whatsapp", "pendiente", "admin", 48, 5], [14, "simulado", "cerrada", "agente", 72, 6],
  [0, "tiktok", "cerrada", "admin", 96, 4], [1, "instagram", "cerrada", "agente", 120, 7], [2, "whatsapp", "cerrada", "agente", 170, 1],
  [3, "facebook", "cerrada", "admin", 200, 5], [4, "simulado", "cerrada", "agente", 240, 6],
];

type Usuario = { id: string };

/** Crea los 15 contactos de prueba y sus 20 conversaciones con mensajes. */
export async function sembrarConversacionesBase(db: PrismaClient, { admin, agente, etiquetas }: { admin: Usuario; agente: Usuario; etiquetas: { id: string }[] }) {
  const contactos = [];
  for (const [i, nombre] of nombres.entries()) {
    contactos.push(
      await db.contact.create({
        data: {
          nombre,
          telefono: `+502555500${String(i + 1).padStart(2, "0")}`,
          notas: "Dato de prueba (ficticio).",
          etiquetas: i % 4 === 0 ? { connect: [{ id: etiquetas[i % 3]!.id }] } : undefined,
        },
      }),
    );
  }

  for (const [n, [ci, canal, estado, quien, horas, g]] of conversaciones.entries()) {
    const contacto = contactos[ci]!;
    const externo = canal === "whatsapp" || canal === "simulado" ? contacto.telefono! : `${canal}_usuario_${ci + 1}`;
    await db.channelIdentity.upsert({
      where: { canal_externalContactId: { canal, externalContactId: externo } },
      create: { contactoId: contacto.id, canal, externalContactId: externo, alias: canal === "whatsapp" || canal === "simulado" ? null : `@usuario_${ci + 1}` },
      update: {},
    });

    const asignada = quien === "admin" ? admin : quien === "agente" ? agente : null;
    const lineas = guiones[g]!;
    const mensajes = lineas.map(([dir, texto], k) => ({
      direccion: dir === "in" ? ("entrante" as const) : ("saliente" as const),
      texto,
      fecha: hace(horas + (lineas.length - 1 - k) * 0.2),
      externalMessageId: `semilla-${n}-${k}`,
      estado: dir === "out" ? (k === lineas.length - 1 ? ("entregado" as const) : ("leido" as const)) : null,
      enviadoPorId: dir === "out" ? (asignada ?? agente).id : null,
      autor: dir === "out" ? ("asesor" as const) : ("cliente" as const),
    }));
    const entrantes = mensajes.filter((m) => m.direccion === "entrante");
    let noLeidos = 0;
    for (let k = mensajes.length - 1; k >= 0 && mensajes[k]!.direccion === "entrante"; k--) noLeidos++;

    await db.conversation.create({
      data: {
        contactoId: contacto.id,
        canal,
        estado,
        creada: mensajes[0]!.fecha,
        motivo: (["precio", "horario", "envio", "existencia", "otro", "garantia", "horario", "existencia"] as const)[g],
        asignadaAId: asignada?.id,
        lastMessageAt: mensajes.at(-1)!.fecha,
        lastInboundAt: entrantes.at(-1)?.fecha ?? null,
        noLeidos: estado === "cerrada" ? 0 : noLeidos,
        // Con asesor asignado la atiende una persona; sin asignar y abierta, espera a que alguien la tome.
        atendidaPor: asignada ? "asesor" : "nadie",
        esperandoAsesorDesde: !asignada && estado !== "cerrada" ? mensajes.at(-1)!.fecha : null,
        mensajes: { create: mensajes },
        notas: n % 6 === 0 ? { create: { autorId: (asignada ?? agente).id, texto: "Nota de prueba: confirmar existencia con la tienda.", fecha: hace(horas) } } : undefined,
      },
    });
  }
}

/** Reparte entre los asesores las conversaciones que esperaban asesor y deja a cada uno como participante y responsable. */
export async function repartirDemo(db: PrismaClient, { equipoAsesores, agente }: { equipoAsesores: Usuario[]; agente: Usuario }) {
  // Las conversaciones abiertas que esperaban asesor se reparten entre los cuatro asesores, salvo las 3 más recientes, que quedan «Sin asignar».
  const esperando = await db.conversation.findMany({ where: { estado: { not: "cerrada" }, asignadaAId: null, atendidaPor: "nadie", esperandoAsesorDesde: { not: null } }, orderBy: { lastMessageAt: "desc" }, select: { id: true } });
  const delAgente = await db.conversation.findMany({ where: { estado: { not: "cerrada" }, asignadaAId: agente.id }, select: { id: true } });
  for (const [i, c] of [...esperando.slice(3), ...delAgente].entries()) {
    const asesor = equipoAsesores[i % equipoAsesores.length]!;
    await db.conversation.update({ where: { id: c.id }, data: { asignadaAId: asesor.id, atendidaPor: "asesor", esperandoAsesorDesde: null } });
  }
  // Cada cliente con una conversación asignada tiene como asesor responsable a quien la atiende (regla de asignación 4a).
  await db.$executeRaw`UPDATE "Contact" c SET "asesorResponsableId" = s."asignadaAId"
    FROM (SELECT DISTINCT ON ("contactoId") "contactoId", "asignadaAId" FROM "Conversation" WHERE "asignadaAId" IS NOT NULL ORDER BY "contactoId", "lastMessageAt" DESC) s
    WHERE c.id = s."contactoId"`;
  // Bandeja compartida (el modo de fábrica): quien atiende cada conversación es su participante principal.
  await db.$executeRaw`INSERT INTO "ParticipanteConversacion" ("conversacionId", "usuarioId", "desde")
    SELECT "id", "asignadaAId", "lastMessageAt" FROM "Conversation" WHERE "asignadaAId" IS NOT NULL ON CONFLICT DO NOTHING`;
}
