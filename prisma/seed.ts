// Datos de prueba: TODO es ficticio. Borra la base y la vuelve a llenar (solo fuera de producción).
import "dotenv/config";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { sembrarDemo } from "./demo";
import { sembrarPedidosDemo } from "./demo-pedidos";
import { sembrarIa } from "./semilla-ia";
import { sembrarPedidosBase } from "./semilla-pedidos";
import { PrismaClient, type Canal, type EstadoConversacion } from "../generated/prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("La semilla no se puede correr en producción.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const clave = () => Array.from({ length: 12 }, () => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(54)]).join("");
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
  [["in", "¿Aceptan tarjeta?"], ["out", "Por ahora cobramos solo por transferencia o depósito bancario. Todavía no aceptamos tarjeta."], ["in", "Perfecto, gracias"]],
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

const productos: [string, string, string, number][] = [
  ["Hogar", "HG-001", "Licuadora de vidrio 1.5 L", 349], ["Hogar", "HG-002", "Set de ollas antiadherentes", 899],
  ["Hogar", "HG-003", "Organizador de cocina", 89], ["Hogar", "HG-004", "Juego de sábanas queen", 249],
  ["Hogar", "HG-005", "Ventilador de pedestal 16 pulgadas", 399], ["Hogar", "HG-006", "Cafetera de goteo 12 tazas", 329],
  ["Hogar", "HG-007", "Sartén de hierro 10 pulgadas", 159], ["Hogar", "HG-008", "Set de toallas, 3 piezas", 179],
  ["Hogar", "HG-009", "Lámpara de mesa LED", 119], ["Hogar", "HG-010", "Escoba y recogedor", 59],
  ["Electrónica", "EL-001", "Bocina bluetooth portátil", 249], ["Electrónica", "EL-002", "Audífonos inalámbricos", 199],
  ["Electrónica", "EL-003", "Cargador USB-C 20 W", 99], ["Electrónica", "EL-004", "Cable HDMI 2 m", 59],
  ["Electrónica", "EL-005", "Regleta con protector, 8 salidas", 129], ["Electrónica", "EL-006", "Smart TV 43 pulgadas", 2899],
  ["Electrónica", "EL-007", "Mouse inalámbrico", 89], ["Electrónica", "EL-008", "Teclado inalámbrico", 149],
  ["Electrónica", "EL-009", "Cámara de seguridad Wi-Fi", 279], ["Electrónica", "EL-010", "Batería externa 10,000 mAh", 189],
  ["Accesorios para carro", "AC-001", "Pantalla para carro 9 pulgadas", 1250], ["Accesorios para carro", "AC-002", "Cubreasientos universal", 199],
  ["Accesorios para carro", "AC-003", "Organizador de maletero", 129], ["Accesorios para carro", "AC-004", "Cargador de carro con dos USB", 69],
  ["Accesorios para carro", "AC-005", "Soporte de celular para carro", 79], ["Accesorios para carro", "AC-006", "Aspiradora de carro 12 V", 149],
  ["Accesorios para carro", "AC-007", "Tapetes universales, 4 piezas", 169], ["Accesorios para carro", "AC-008", "Compresor de aire portátil", 259],
  ["Accesorios para carro", "AC-009", "Cámara de reversa", 189], ["Accesorios para carro", "AC-010", "Cables pasacorriente", 249],
];

async function main() {
  await db.activityLog.deleteMany();
  await db.historialEstadoAsesor.deleteMany();
  await db.ajustesEquipo.deleteMany();
  await db.payment.deleteMany();
  await db.orderEvent.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cotizacion.deleteMany(); // sus líneas se borran con ella
  await db.ajustesPedidos.deleteMany();
  await db.bankAccount.deleteMany();
  await db.shippingZone.deleteMany();
  await db.aiRun.deleteMany();
  await db.conversationSummary.deleteMany();
  await db.knowledgeItem.deleteMany();
  await db.aiSettings.deleteMany();
  await db.note.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.channelIdentity.deleteMany();
  await db.contact.deleteMany();
  await db.tag.deleteMany();
  await db.stock.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.location.deleteMany();
  await db.quickReply.deleteMany();
  await db.negocio.deleteMany();

  // Los usuarios no se borran: así conservan su contraseña. Solo se crean los que falten.
  const claves: string[] = [];
  const asegurarUsuario = async (nombre: string, correo: string, rol: "admin" | "agente" | "bodega") => {
    const existente = await db.user.findUnique({ where: { correo } });
    if (existente) return existente;
    const c = clave();
    claves.push(`  ${rol.padEnd(6)} ${correo}  ${c}`);
    return db.user.create({ data: { nombre, correo, passwordHash: await bcrypt.hash(c, 10), rol } });
  };
  const admin = await asegurarUsuario("Admin de prueba", "admin@homeoutlet.test", "admin");
  const agente = await asegurarUsuario("Agente de prueba", "agente@homeoutlet.test", "agente");
  await asegurarUsuario("Bodega de prueba", "bodega@homeoutlet.test", "bodega"); // solo catálogo y despacho

  // Tres asesores más para probar el reparto: uno Disponible, uno En pausa (hace 12 min, almuerzo) y uno Desconectado.
  const carlos = await asegurarUsuario("Carlos Pérez", "carlos@homeoutlet.test", "agente");
  const monica = await asegurarUsuario("Mónica Aguilar", "monica@homeoutlet.test", "agente");
  const luis = await asegurarUsuario("Luis Herrera", "luis@homeoutlet.test", "agente");
  const ahoraSemilla = Date.now();
  const fijarEstado = async (u: { id: string }, estado: "disponible" | "en_pausa" | "desconectado", motivo: string | null, haceMin: number) => {
    const desde = new Date(ahoraSemilla - haceMin * 60_000);
    await db.user.update({ where: { id: u.id }, data: { estadoAsesor: estado, estadoDesde: desde, motivoPausa: motivo, ultimaSenal: estado === "desconectado" ? null : new Date(ahoraSemilla) } });
    await db.historialEstadoAsesor.create({ data: { usuarioId: u.id, estado, motivo, origen: "manual", inicio: desde } });
  };
  await fijarEstado(carlos, "disponible", null, 95);
  await fijarEstado(monica, "en_pausa", "Almuerzo", 42); // lleva más de 30 min: se pueden repartir sus conversaciones
  await fijarEstado(luis, "desconectado", null, 240);
  await fijarEstado(agente, "desconectado", null, 600);

  const etiquetas = await Promise.all([
    db.tag.create({ data: { nombre: "Mayorista", color: "carbon" } }),
    db.tag.create({ data: { nombre: "Cliente frecuente", color: "naranja" } }),
    db.tag.create({ data: { nombre: "Envío a Morales", color: "exito" } }),
  ]);

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

  const ubicaciones = [await db.location.create({ data: { nombre: "Tienda física" } }), await db.location.create({ data: { nombre: "Tienda en línea" } })];
  const categorias = new Map<string, string>();
  for (const [orden, nombre] of ["Hogar", "Electrónica", "Accesorios para carro"].entries()) {
    categorias.set(nombre, (await db.category.create({ data: { nombre, orden } })).id);
  }
  for (const [i, [cat, sku, nombre, quetzales]] of productos.entries()) {
    const sinExistencia = sku === "AC-001";
    await db.product.create({
      data: {
        sku, nombre, precio: quetzales * 100, categoriaId: categorias.get(cat),
        descripcion: "Producto de ejemplo (dato de prueba).",
        imagenes: ["/placeholder/producto.svg"],
        stock: { create: ubicaciones.map((u, k) => ({ ubicacionId: u.id, cantidad: sinExistencia ? 0 : sku === "HG-002" ? (k === 0 ? 2 : 0) : k === 0 ? (i * 7) % 13 : (i * 5) % 9 })) },
      },
    });
  }

  await sembrarIa(db);
  await db.quickReply.createMany({
    data: [
      { atajo: "/saludo", texto: "Hola, gracias por escribir a {negocio}. ¿En qué le podemos ayudar?" },
      { atajo: "/horario", texto: "Nuestro horario de atención es: {horario}" },
      { atajo: "/ubicacion", texto: "Nos encontramos en: {direccion}" },
      { atajo: "/pagos", texto: "{pagos}" },
      { atajo: "/envios", texto: "{envios}" },
      { atajo: "/garantia", texto: "{garantia}" },
    ],
  });

  await sembrarPedidosBase(db);
  // Las conversaciones de la demostración se reparten entre los cuatro asesores; algunas quedan sin asignar.
  await sembrarDemo(db, [agente, carlos, monica, luis]);
  await sembrarPedidosDemo(db, [admin, agente]);
  // Las conversaciones abiertas que esperaban asesor se reparten entre los cuatro asesores, salvo las 3 más recientes, que quedan «Sin asignar».
  const equipoAsesores = [carlos, monica, luis, agente];
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

  console.log("\nSemilla lista.");
  console.log(claves.length ? `Usuarios nuevos (anótelas, no se vuelven a mostrar):\n${claves.join("\n")}\n` : "Los usuarios que ya existían conservan su contraseña.\n");
}

main().finally(() => db.$disconnect());
