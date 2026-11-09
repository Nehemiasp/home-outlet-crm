// Contenido de demostración del negocio y del asistente.
import type { PrismaClient } from "../generated/prisma/client";

const dia = (abre: string, cierra: string) => ({ abre, cierra });

export const datosNegocio = {
  nombre: "Home Outlet Internacional",
  horario: "Lunes a sábado de 8:00 a 18:00 y domingo de 9:00 a 13:00",
  // Las dos tiendas (9-nov-2026), una por línea. Cada una tiene además su dirección en Ajustes → Pagos y envíos (la del resumen al recoger).
  direccion:
    "Tienda Puerto Barrios: 7a. avenida y 10a. calle, zona 1, Puerto Barrios, Izabal, frente al parque (hay parqueo).\nTienda Mixco: 4 calle 11-47 zona 2 de Mixco, colonia Santa Mónica, Guatemala.",
  // Formas de pago y cobertura reales de Home Outlet (9-nov-2026).
  pagos: "Aceptamos transferencia y depósito bancario, efectivo en la tienda, pago contra entrega y Visacuotas (tarjeta Visa en cuotas).",
  // El costo sale de Ajustes → Pagos y envíos → Costo del envío (Q35 contra entrega; con las demás formas, gratis desde Q200 y Q35 por debajo): si cambia allá, cambiar aquí.
  // El mismo día: en Puerto Barrios solo lo que sale de esa tienda, y en el departamento de Guatemala lo que sale de la de Mixco (igual que las zonas).
  envios:
    "Enviamos a toda Guatemala. Con pago contra entrega el envío cuesta Q35. Si paga antes por depósito, transferencia o tarjeta, el envío es gratis en compras de Q200 o más (en compras menores cuesta Q35). Entregamos el mismo día en Puerto Barrios los productos de la tienda de Puerto Barrios, y en el departamento de Guatemala los de la tienda de Mixco.",
  // La política real de Home Outlet (garantías, cambios y devoluciones), dada por el cliente el 9-nov-2026. El cliente no dio plazo:
  // 30 días es el que fijó Nehemias mientras el cliente lo confirma. No pide factura.
  garantia:
    "La garantía es de 30 días y cubre únicamente fallas de fábrica. Si su producto no funciona, escríbanos: primero lo revisamos con usted por llamada. Si se confirma la falla, le enviamos la guía de devolución para que lo entregue en Forza. El producto debe volver en su caja original, con todos sus accesorios, envuelto en nailon, limpio y sin golpes ni roturas. Al recibirlo lo revisamos: si es una falla de fábrica, le enviamos uno nuevo sin costo de envío. Si llega dañado o la falla no es de fábrica, la garantía no aplica y usted decide si paga el envío para que le devolvamos su producto. Los cambios por otro producto (del mismo valor, o de mayor valor pagando la diferencia) tienen las mismas condiciones. Cada caso lo autoriza la administración.",
  // Lunes a domingo
  horarioSemanal: [dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("08:00", "18:00"), dia("09:00", "13:00")],
};

export const preguntasFrecuentes: [string, string, string][] = [
  ["¿Cuál es el horario de atención?", "Atendemos de lunes a sábado de 8:00 a 18:00 y los domingos de 9:00 a 13:00.", "horario"],
  ["¿Dónde están ubicados?", "Tenemos dos tiendas: en Puerto Barrios, en la 7a. avenida y 10a. calle, zona 1, frente al parque (con parqueo), y en Mixco, en la 4 calle 11-47 zona 2, colonia Santa Mónica.", "ubicación"],
  ["¿Tienen tienda en la capital?", "Sí, tenemos tienda en Mixco: 4 calle 11-47 zona 2, colonia Santa Mónica. También tenemos tienda en Puerto Barrios.", "ubicación"],
  ["¿Hacen envíos a todo el país?", "Sí, enviamos a toda Guatemala. Con pago contra entrega el envío cuesta Q35; si paga antes por depósito, transferencia o tarjeta, es gratis en compras de Q200 o más.", "envíos"],
  ["¿Cuánto cuesta el envío?", "Con pago contra entrega cuesta Q35 y paga todo al recibir. Si paga antes por depósito, transferencia o tarjeta, el envío es gratis en compras de Q200 o más; en compras menores cuesta Q35.", "envíos"],
  ["¿Cuánto tarda un envío?", "Depende del municipio. En Puerto Barrios entregamos el mismo día los productos de la tienda de Puerto Barrios, y en el departamento de Guatemala, los de la tienda de Mixco. Al hacer su pedido le indicamos el tiempo de entrega.", "envíos"],
  ["¿Qué formas de pago aceptan?", "Aceptamos transferencia y depósito bancario, efectivo en la tienda, pago contra entrega y Visacuotas (tarjeta Visa en cuotas).", "pagos"],
  ["¿Puedo pagar con tarjeta en cuotas?", "Sí, aceptamos Visacuotas. Un asesor le explica las cuotas disponibles y las condiciones al hacer su pedido.", "pagos"],
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
  ["¿Puedo recoger mi pedido en la tienda?", "Sí, puede recogerlo en nuestra tienda de Puerto Barrios o en la de Mixco, durante el horario de atención. Al hacer su pedido nos dice en cuál.", "compras"],
  ["¿Los productos son nuevos?", "Todos nuestros productos son nuevos y vienen en su empaque original, salvo que se indique lo contrario.", "productos"],
];

export async function sembrarIa(db: PrismaClient) {
  await db.negocio.create({ data: { id: "negocio", ...datosNegocio } });
  await db.aiSettings.create({ data: { id: "ia", presupuestoMensualUsd: 6 } });
  await db.knowledgeItem.createMany({ data: preguntasFrecuentes.map(([pregunta, respuesta, categoria]) => ({ pregunta, respuesta, categoria })) });
}
