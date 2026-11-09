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
  // La política real de Home Outlet (garantías, cambios y devoluciones), dada por el cliente el 9-nov-2026. El cliente no dio plazo:
  // 30 días es el que fijó Nehemias mientras el cliente lo confirma. No pide factura.
  garantia:
    "La garantía es de 30 días y cubre únicamente fallas de fábrica. Si su producto no funciona, escríbanos: primero lo revisamos con usted por llamada. Si se confirma la falla, le enviamos la guía de devolución para que lo entregue en Forza. El producto debe volver en su caja original, con todos sus accesorios, envuelto en nailon, limpio y sin golpes ni roturas. Al recibirlo lo revisamos: si es una falla de fábrica, le enviamos uno nuevo sin costo de envío. Si llega dañado o la falla no es de fábrica, la garantía no aplica y usted decide si paga el envío para que le devolvamos su producto. Los cambios por otro producto (del mismo valor, o de mayor valor pagando la diferencia) tienen las mismas condiciones. Cada caso lo autoriza la administración.",
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
  ["¿Los productos tienen garantía?", "Sí, la garantía es de 30 días y cubre las fallas de fábrica. Si su producto no funciona, escríbanos: primero lo revisamos con usted por llamada y, si se confirma la falla, le enviamos la guía para devolverlo por Forza. Si es una falla de fábrica, le enviamos uno nuevo sin costo de envío.", "garantía"],
  ["¿Hacen cambios y devoluciones?", "Sí, hacemos cambios: si el producto no cumplió lo que esperaba, primero le explicamos cómo usarlo o le enviamos uno para que lo pruebe. Si aun así no queda satisfecho, lo cambiamos por otro producto del mismo valor, o por uno de mayor valor pagando la diferencia. Aplican las mismas condiciones que la garantía y cada caso lo autoriza la administración.", "garantía"],
  ["¿En qué condiciones debe volver el producto?", "Debe volver en su caja original, con todos sus accesorios, envuelto en nailon, limpio y sin golpes ni roturas. Si llega dañado o incompleto, no se puede aplicar la garantía ni el cambio.", "garantía"],
  ["¿Cómo devuelvo un producto?", "Le enviamos una guía de devolución. Usted lleva el paquete a Forza, pega la guía y lo envía. Cuando llega, revisamos el producto y le avisamos el resultado.", "garantía"],
  // Sin palabras sueltas como «quién»: el buscador compara palabras y una pregunta ajena («¿Quién ganó el partido?») caía aquí.
  ["Si la garantía no aplica, ¿el envío de regreso lo paga el cliente?", "Si al revisarlo vemos que el producto llegó dañado o que la falla no es de fábrica, la garantía no aplica. Le avisamos y usted decide si paga el envío para que le devolvamos su producto.", "garantía"],
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
