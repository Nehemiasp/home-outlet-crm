// Contenido de demostración del negocio y del asistente.
import type { PrismaClient } from "../generated/prisma/client";

const dia = (abre: string, cierra: string) => ({ abre, cierra });

export const datosNegocio = {
  nombre: "Home Outlet Internacional",
  horario: "Lunes a sábado de 8:00 a 18:00 y domingo de 9:00 a 13:00",
  direccion: "7a. avenida y 10a. calle, zona 1, Puerto Barrios, Izabal, frente al parque. Hay parqueo.",
  // Temporal: hoy solo cobran por transferencia y depósito; se cambia cuando el cliente confirme los métodos.
  pagos: "Por ahora cobramos solo por transferencia o depósito bancario. Todavía no aceptamos tarjeta.",
  envios: "Enviamos a Puerto Barrios, Morales, Los Amates y Santo Tomás de Castilla. El costo depende del municipio y del tamaño del producto.",
  garantia: "Los artículos electrónicos tienen 30 días de garantía contra defectos de fábrica, presentando la factura.",
  // Lunes a domingo
  horarioSemanal: [dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("09:00", "13:00")],
};

export const preguntasFrecuentes: [string, string, string][] = [
  ["¿Cuál es el horario de atención?", "Atendemos de lunes a sábado de 8:00 a 18:00 y los domingos de 9:00 a 13:00.", "horario"],
  ["¿Dónde están ubicados?", "Estamos en la 7a. avenida y 10a. calle, zona 1, Puerto Barrios, frente al parque. Tenemos parqueo para clientes.", "ubicación"],
  ["¿Hacen envíos a Morales, Los Amates o Santo Tomás de Castilla?", "Sí, enviamos a Morales, Los Amates y Santo Tomás de Castilla. El costo depende del municipio y del tamaño del producto.", "envíos"],
  ["¿Cuánto tarda un envío?", "En Puerto Barrios entregamos el mismo día si el pedido se confirma temprano. A otros municipios tarda de 1 a 2 días hábiles.", "envíos"],
  ["¿Qué formas de pago aceptan?", "Por ahora cobramos solo por transferencia o depósito bancario. Todavía no aceptamos tarjeta.", "pagos"],
  ["¿Cobran recargo por pagar con tarjeta?", "Por ahora no se paga con tarjeta, y por transferencia o depósito no hay ningún recargo.", "pagos"],
  ["¿Los productos tienen garantía?", "Los artículos electrónicos tienen 30 días de garantía contra defectos de fábrica, presentando la factura. Para los demás productos, un asesor revisa cada caso.", "garantía"],
  ["¿Hacen cambios y devoluciones?", "Aceptamos cambios dentro de los 8 días con la factura, y con el producto sin uso y en su empaque original.", "garantía"],
  ["¿Instalan las pantallas para carro?", "Sí, instalamos pantallas para carro en la tienda, con cita previa. El costo depende del modelo del vehículo.", "servicios"],
  ["¿Se pueden apartar productos?", "Sí, se puede apartar un producto con un anticipo. Un asesor le explica las condiciones.", "compras"],
  ["¿Dan factura?", "Sí, emitimos factura en todas las compras. Si la necesita a nombre de una empresa, indique su NIT.", "compras"],
  ["¿Tienen precio por mayoreo?", "Las compras al por mayor las revisa un asesor caso por caso.", "compras"],
  ["¿Las existencias de la tienda en línea y de la tienda física son las mismas?", "Llevamos las existencias de la tienda física y de la tienda en línea por separado. Puedo consultar cuántas unidades hay en cada una.", "existencias"],
  ["¿Puedo recoger mi pedido en la tienda?", "Sí, puede recogerlo en el local durante el horario de atención.", "compras"],
  ["¿Los productos son nuevos?", "Todos nuestros productos son nuevos y vienen en su empaque original, salvo que se indique lo contrario.", "productos"],
];

export async function sembrarIa(db: PrismaClient) {
  await db.negocio.create({ data: { id: "negocio", ...datosNegocio } });
  await db.aiSettings.create({ data: { id: "ia", presupuestoMensualUsd: 6 } });
  await db.knowledgeItem.createMany({ data: preguntasFrecuentes.map(([pregunta, respuesta, categoria]) => ({ pregunta, respuesta, categoria })) });
}
