import { textoLugar } from "@/lib/guatemala";
import { formatQ } from "@/lib/utils";

export type ClaveMensaje = "resumen" | "comprobante_recibido" | "pago_confirmado" | "pago_parcial" | "pago_rechazado" | "listo_para_recoger" | "enviado" | "vencido" | "por_vencer" | "enlace_tarjeta" | "resumen_tarjeta" | "resumen_efectivo" | "cotizacion";
export type VariablesMensaje = Partial<Record<"codigo" | "total" | "saldo" | "cuentas" | "direccion" | "horario" | "guia" | "horas" | "motivo" | "enlace" | "vence", string>>;

/**
 * Textos de fábrica de lo que se le manda al cliente. Cada uno se puede editar y apagar en Ajustes → Pagos y envíos → Mensajes.
 * Tono: trato de «usted», cálido, con una línea clara arriba, lo que sigue en viñetas y un cierre amable; el 🧡 es el de la marca
 * (el mismo del saludo del asistente). Los emojis son pocos y cada uno señala algo (✅ confirmado, 📦 listo, 🚚 en camino, ⏰ plazo).
 */
export const MENSAJES: Record<ClaveMensaje, { titulo: string; texto: string; activo: boolean }> = {
  resumen: {
    titulo: "Resumen del pedido (texto al pie)",
    texto:
      "Puede pagar por transferencia o depósito a una de estas cuentas:\n{cuentas}\n\n📌 Para confirmar su pedido:\n• Haga el pago por el total.\n• Envíenos la foto del comprobante por este chat, indicando el número de pedido.\n\nApartamos sus productos por {horas}. Pasado ese tiempo se liberan. 🧡",
    activo: true,
  },
  resumen_tarjeta: {
    titulo: "Resumen del pedido pagando con tarjeta (texto al pie)",
    texto:
      "Puede pagar con tarjeta de crédito o débito en este enlace seguro:\n{enlace}\n\n📌 Es muy sencillo:\n• Abra el enlace y complete el pago.\n• Le confirmamos por este chat en cuanto se acredite.\n\nApartamos sus productos por {horas}. Pasado ese tiempo se liberan. 🧡",
    activo: true,
  },
  resumen_efectivo: {
    titulo: "Resumen del pedido pagando en efectivo (texto al pie)",
    texto: "Pagará en efectivo al recoger su pedido en la tienda.\n\n📌 Recuerde:\n• Indique el número de pedido {codigo} al llegar.\n• Apartamos sus productos por {horas}. Pasado ese tiempo se liberan.\n\n¡Lo esperamos! 🧡",
    activo: true,
  },
  comprobante_recibido: {
    titulo: "Comprobante recibido",
    texto: "Recibimos su comprobante del pedido {codigo}. ¡Gracias! 🧡\n\nLo estamos verificando y le avisaremos por este chat en cuanto esté confirmado el pago.",
    activo: true,
  },
  pago_confirmado: {
    titulo: "Pago confirmado",
    texto: "Confirmamos su pago del pedido {codigo}. ¡Muchas gracias por su compra! 🧡\n\n✅ Qué sigue:\n• Ya estamos preparando su pedido.\n• Le avisaremos por este chat cuando esté listo.",
    activo: true,
  },
  pago_parcial: {
    titulo: "Pago parcial confirmado",
    texto: "Confirmamos un pago de su pedido {codigo}. ¡Gracias! 🧡\n\nTodavía queda un saldo de {saldo}.\nPuede completarlo y enviarnos el comprobante por este chat.",
    activo: true,
  },
  pago_rechazado: {
    titulo: "Pago rechazado",
    texto: "No pudimos confirmar el pago de su pedido {codigo}.\n\nMotivo: {motivo}\n\nSi ya hizo el pago, envíenos otra foto del comprobante por este chat y lo revisamos de nuevo. Si tiene alguna duda, respóndanos por aquí y con gusto le ayudamos.",
    activo: true,
  },
  listo_para_recoger: {
    titulo: "Listo para recoger",
    texto: "📦 ¡Su pedido {codigo} está listo para recoger! 🧡\n\n📍 Lo esperamos en: {direccion}\n🕒 Horario: {horario}\n\nAl llegar, indique el número de pedido.",
    activo: true,
  },
  enviado: {
    titulo: "Pedido enviado",
    texto: "🚚 ¡Su pedido {codigo} va en camino! 🧡\n\n{guia}\n\nSi tiene alguna duda con su entrega, escríbanos por este chat.",
    activo: true,
  },
  vencido: {
    titulo: "Pedido vencido",
    texto: "Su pedido {codigo} venció porque no recibimos el pago a tiempo, y liberamos los productos.\n\nSi todavía le interesa, escríbanos por este chat y con gusto lo revisamos de nuevo. 🧡",
    activo: true,
  },
  enlace_tarjeta: {
    titulo: "Enlace de pago con tarjeta",
    texto: "Puede pagar el saldo de su pedido {codigo} ({saldo}) con tarjeta de crédito o débito en este enlace seguro:\n{enlace}\n\nLe confirmamos por este chat en cuanto se acredite el pago. 🧡",
    activo: true,
  },
  cotizacion: {
    titulo: "Cotización (texto al pie)",
    texto: "⏰ Estos precios valen hasta el {vence}.\n\n📌 Tome en cuenta:\n• Los productos no quedan apartados hasta que confirme su pedido.\n• Cuando quiera hacerlo, respóndanos por este chat y lo preparamos. 🧡",
    activo: true,
  },
  por_vencer: {
    titulo: "Reserva por vencer (2 horas antes)",
    texto: "⏰ Le recordamos que su pedido {codigo} vence en 2 horas.\nTotal: {total}\n\nPuede pagar a:\n{cuentas}\n\nSi ya pagó, envíenos el comprobante por este chat. 🧡",
    activo: false,
  },
};

export const CLAVES_MENSAJE = Object.keys(MENSAJES) as ClaveMensaje[];

/** Reemplaza {variables}. Las que no se conocen se dejan tal cual para que se note el error. */
export function rellenar(texto: string, v: VariablesMensaje) {
  return texto.replace(/\{(codigo|total|saldo|cuentas|direccion|horario|guia|horas|motivo|enlace|vence)\}/g, (_, k: keyof VariablesMensaje) => v[k] ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const textoHoras = (h: number) => (h === 1 ? "1 hora" : `${h} horas`);

type LineaResumen = { productoId: string | null; sku: string; nombre: string; precio: number; cantidad: number };

/** Junta las líneas partidas por ubicación: el cliente ve cada producto una sola vez. */
export function agruparLineas<T extends LineaResumen>(lineas: readonly T[]) {
  const por = new Map<string, { nombre: string; precio: number; cantidad: number }>();
  for (const l of lineas) {
    const k = l.productoId ?? l.sku;
    const previa = por.get(k);
    if (previa) previa.cantidad += l.cantidad;
    else por.set(k, { nombre: l.nombre, precio: l.precio, cantidad: l.cantidad });
  }
  return [...por.values()];
}

export type DatosResumen = {
  codigo: string;
  lineas: readonly LineaResumen[];
  descuentoMonto: number;
  costoEnvio: number;
  total: number;
  entrega: "recoger" | "envio";
  departamento?: string | null;
  municipio: string | null;
  direccionTienda: string | null;
};

/** El mensaje que recibe el cliente al enviar el pedido (o la cotización): las líneas, los totales y el pie con las cuentas o la vigencia. */
export function textoResumen(d: DatosResumen, pie: string, encabezado: "Pedido" | "Cotización" = "Pedido") {
  const filas = agruparLineas(d.lineas).map((l) => `${l.cantidad} × ${l.nombre}   ${formatQ(l.precio * l.cantidad)}`);
  if (d.descuentoMonto > 0) filas.push(`Descuento   -${formatQ(d.descuentoMonto)}`);
  filas.push(d.entrega === "envio" ? `Envío a ${textoLugar(d.municipio, d.departamento) || "su municipio"}   ${d.costoEnvio === 0 ? "Gratis" : formatQ(d.costoEnvio)}` : `Recoger en tienda${d.direccionTienda ? `: ${d.direccionTienda}` : ""}`);
  filas.push(`Total   ${formatQ(d.total)}`);
  return `${encabezado} ${d.codigo}\n\n${filas.join("\n")}\n\n${pie}`;
}
