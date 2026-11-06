import { formatQ } from "@/lib/utils";

export type ClaveMensaje = "resumen" | "comprobante_recibido" | "pago_confirmado" | "pago_parcial" | "pago_rechazado" | "listo_para_recoger" | "enviado" | "vencido" | "por_vencer" | "enlace_tarjeta" | "resumen_tarjeta" | "resumen_efectivo";
export type VariablesMensaje = Partial<Record<"codigo" | "total" | "saldo" | "cuentas" | "direccion" | "horario" | "guia" | "horas" | "motivo" | "enlace", string>>;

/** Textos de fábrica de lo que se le manda al cliente. Cada uno se puede editar y apagar en Ajustes → Pagos y envíos → Mensajes. */
export const MENSAJES: Record<ClaveMensaje, { titulo: string; texto: string; activo: boolean }> = {
  resumen: {
    titulo: "Resumen del pedido (texto al pie)",
    texto: "Puede pagar por transferencia o depósito a:\n{cuentas}\n\nEnvíe una foto del comprobante por este chat indicando el número de pedido.\nApartamos sus productos por {horas}.",
    activo: true,
  },
  resumen_tarjeta: {
    titulo: "Resumen del pedido pagando con tarjeta (texto al pie)",
    texto: "Puede pagar con tarjeta de crédito o débito en este enlace seguro:\n{enlace}\nApartamos sus productos por {horas}.",
    activo: true,
  },
  resumen_efectivo: { titulo: "Resumen del pedido pagando en efectivo (texto al pie)", texto: "Pagará en efectivo al recoger su pedido en la tienda.\nApartamos sus productos por {horas}.", activo: true },
  comprobante_recibido: { titulo: "Comprobante recibido", texto: "Recibimos su comprobante del pedido {codigo}. Lo estamos verificando y le avisamos en cuanto esté confirmado.", activo: true },
  pago_confirmado: { titulo: "Pago confirmado", texto: "Confirmamos su pago del pedido {codigo}. ¡Gracias por su compra! Ya estamos preparando su pedido.", activo: true },
  pago_parcial: { titulo: "Pago parcial confirmado", texto: "Confirmamos un pago de su pedido {codigo}. Todavía queda un saldo de {saldo}. Puede enviarnos el comprobante por este chat.", activo: true },
  pago_rechazado: { titulo: "Pago rechazado", texto: "No pudimos confirmar el pago de su pedido {codigo}. Motivo: {motivo}\nSi ya hizo el pago, envíenos otra foto del comprobante por este chat.", activo: true },
  listo_para_recoger: { titulo: "Listo para recoger", texto: "Su pedido {codigo} está listo para recoger en: {direccion}\nHorario: {horario}", activo: true },
  enviado: { titulo: "Pedido enviado", texto: "Su pedido {codigo} va en camino. {guia}", activo: true },
  vencido: { titulo: "Pedido vencido", texto: "Su pedido {codigo} venció porque no recibimos el pago a tiempo y liberamos los productos. Si todavía le interesa, escríbanos y lo revisamos.", activo: true },
  enlace_tarjeta: { titulo: "Enlace de pago con tarjeta", texto: "Puede pagar el saldo de su pedido {codigo} ({saldo}) con tarjeta de crédito o débito en este enlace seguro:\n{enlace}", activo: true },
  por_vencer: { titulo: "Reserva por vencer (2 horas antes)", texto: "Le recordamos que su pedido {codigo} vence en 2 horas. Total: {total}\nPuede pagar a:\n{cuentas}", activo: false },
};

export const CLAVES_MENSAJE = Object.keys(MENSAJES) as ClaveMensaje[];

/** Reemplaza {variables}. Las que no se conocen se dejan tal cual para que se note el error. */
export function rellenar(texto: string, v: VariablesMensaje) {
  return texto.replace(/\{(codigo|total|saldo|cuentas|direccion|horario|guia|horas|motivo|enlace)\}/g, (_, k: keyof VariablesMensaje) => v[k] ?? "").replace(/[ \t]+\n/g, "\n").trim();
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
  municipio: string | null;
  direccionTienda: string | null;
};

/** El mensaje que recibe el cliente al enviar el pedido: las líneas, los totales y el pie con las cuentas. */
export function textoResumen(d: DatosResumen, pie: string) {
  const filas = agruparLineas(d.lineas).map((l) => `${l.cantidad} × ${l.nombre}   ${formatQ(l.precio * l.cantidad)}`);
  if (d.descuentoMonto > 0) filas.push(`Descuento   -${formatQ(d.descuentoMonto)}`);
  filas.push(d.entrega === "envio" ? `Envío a ${d.municipio ?? "su municipio"}   ${d.costoEnvio === 0 ? "Gratis" : formatQ(d.costoEnvio)}` : `Recoger en tienda${d.direccionTienda ? `: ${d.direccionTienda}` : ""}`);
  filas.push(`Total   ${formatQ(d.total)}`);
  return `Pedido ${d.codigo}\n\n${filas.join("\n")}\n\n${pie}`;
}
