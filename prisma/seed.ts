// Datos de prueba: TODO es ficticio. Borra la base y la vuelve a llenar (solo fuera de producción).
import "dotenv/config";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { sembrarDemo } from "./demo";
import { sembrarPedidosDemo } from "./demo-pedidos";
import { sembrarIa } from "./semilla-ia";
import { sembrarPedidosBase } from "./semilla-pedidos";
import { repartirDemo, sembrarConversacionesBase } from "./semilla-conversaciones";
import { PrismaClient } from "../generated/prisma/client";
import { TIENDAS } from "../lib/tiendas";

if (process.env.NODE_ENV === "production") throw new Error("La semilla no se puede correr en producción.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const clave = () => Array.from({ length: 12 }, () => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(54)]).join("");

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

  await sembrarConversacionesBase(db, { admin, agente, etiquetas });

  const ubicaciones = [];
  for (const t of TIENDAS) ubicaciones.push(await db.location.create({ data: t }));
  const categorias = new Map<string, string>();
  for (const [orden, nombre] of ["Hogar", "Electrónica", "Accesorios para carro"].entries()) {
    categorias.set(nombre, (await db.category.create({ data: { nombre, orden } })).id);
  }
  // 999 en cada producto y tienda: así lo lleva Home Outlet (9-nov-2026), porque el inventario no está al día (se cuenta cada semana)
  // y la existencia la confirma un asesor. El cliente nunca la ve (ver lib/ia/herramientas.ts).
  for (const [cat, sku, nombre, quetzales] of productos) {
    await db.product.create({
      data: {
        sku, nombre, precio: quetzales * 100, categoriaId: categorias.get(cat),
        descripcion: "Producto de ejemplo (dato de prueba).",
        imagenes: ["/placeholder/producto.svg"],
        stock: { create: ubicaciones.map((u) => ({ ubicacionId: u.id, cantidad: 999 })) },
      },
    });
  }

  await sembrarIa(db);
  await db.quickReply.createMany({
    data: [
      { atajo: "/saludo", texto: "Hola, gracias por escribir a {negocio}. ¿En qué le podemos ayudar?" },
      { atajo: "/horario", texto: "Nuestro horario de atención es: {horario}" },
      { atajo: "/ubicacion", texto: "Nuestras tiendas:\n{direccion}" },
      // La pidió Home Outlet (9-nov-2026). Los montos son los de Ajustes → Pagos y envíos: si cambian allá, cambiar aquí.
      {
        atajo: "/datos",
        texto:
          "Para gestionar su pedido, necesitamos los siguientes datos, por favor:\n👤 Nombre de la persona que recibirá:\n📍 Dirección completa de entrega:\n📞 Número de teléfono:\n💳 Forma de pago:\n\nFormas de pago: si es pago contra entrega, el envío tiene un costo de Q35.00. Si realiza antes un depósito o una transferencia, su envío es totalmente gratis en compras de Q200.00 o más.",
      },
      { atajo: "/pagos", texto: "{pagos}" },
      { atajo: "/envios", texto: "{envios}" },
      { atajo: "/garantia", texto: "{garantia}" },
    ],
  });

  await sembrarPedidosBase(db);
  // Las conversaciones de la demostración se reparten entre los cuatro asesores; algunas quedan sin asignar.
  await sembrarDemo(db, [agente, carlos, monica, luis]);
  await sembrarPedidosDemo(db, [admin, agente]);
  await repartirDemo(db, { equipoAsesores: [carlos, monica, luis, agente], agente });

  console.log("\nSemilla lista.");
  console.log(claves.length ? `Usuarios nuevos (anótelas, no se vuelven a mostrar):\n${claves.join("\n")}\n` : "Los usuarios que ya existían conservan su contraseña.\n");
}

main().finally(() => db.$disconnect());
