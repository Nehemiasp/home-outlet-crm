import type { TipoPago } from "@/generated/prisma/client";

/**
 * Un método de pago. Los pedidos solo conocen esta forma. La tarjeta se cobra por una pasarela (lib/pagos-tarjeta): solo se
 * puede encender si hay una conectada (se valida al guardar los ajustes).
 */
export interface MetodoPago {
  id: TipoPago;
  nombre: string;
  /** Hay que registrar un comprobante y verificarlo a mano. */
  requiereComprobante: boolean;
  /** Se puede encender en Ajustes. */
  disponible: boolean;
  /** Encendido de fábrica. */
  porDefecto: boolean;
  nota?: string;
}

export const METODOS: readonly MetodoPago[] = [
  { id: "transferencia", nombre: "Transferencia bancaria", requiereComprobante: true, disponible: true, porDefecto: true },
  { id: "deposito", nombre: "Depósito bancario", requiereComprobante: true, disponible: true, porDefecto: true },
  { id: "efectivo_en_tienda", nombre: "Efectivo en la tienda", requiereComprobante: false, disponible: true, porDefecto: false, nota: "Al recoger el pedido." },
  { id: "tarjeta", nombre: "Tarjeta de crédito o débito", requiereComprobante: false, disponible: true, porDefecto: false, nota: "Necesita una pasarela de pago conectada." },
  { id: "contra_entrega", nombre: "Pago contra entrega", requiereComprobante: false, disponible: true, porDefecto: true, nota: "Solo con envío; el envío cuesta lo que diga abajo." },
];

/**
 * Pago contra entrega: el cliente paga al recibir el envío. El pedido sale sin pago previo: de «pendiente de pago» puede pasar
 * a «preparando» (ahí se descuenta la existencia), no vence, y al marcarlo como entregado se registra el cobro.
 */
export const esContraEntrega = (id: TipoPago | null | undefined) => id === "contra_entrega";

/** El efectivo en tienda solo sirve cuando el cliente recoge el pedido, y el pago contra entrega solo con envío. */
export const compatibleConEntrega = (id: TipoPago, entrega: "recoger" | "envio") => (id !== "efectivo_en_tienda" || entrega === "recoger") && (id !== "contra_entrega" || entrega === "envio");
/** Nombres cortos para la lista de pedidos. */
export const NOMBRE_CORTO: Record<TipoPago, string> = { transferencia: "Transferencia", deposito: "Depósito", efectivo_en_tienda: "Efectivo", tarjeta: "Tarjeta", contra_entrega: "Contra entrega" };

export const nombreMetodo = (id: TipoPago) => METODOS.find((m) => m.id === id)?.nombre ?? id;
export const metodosSeleccionables = (): TipoPago[] => METODOS.filter((m) => m.disponible).map((m) => m.id);
