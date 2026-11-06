import type { TipoPago } from "@/generated/prisma/client";

/**
 * Un método de pago. Los pedidos solo conocen esta forma: la tarjeta de la fase 3 entra agregando
 * un elemento a METODOS (con su pasarela) sin cambiar pedidos ni pagos.
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
  { id: "tarjeta", nombre: "Tarjeta de crédito o débito", requiereComprobante: false, disponible: false, porDefecto: false, nota: "Disponible en la fase 3." },
];

export const nombreMetodo = (id: TipoPago) => METODOS.find((m) => m.id === id)?.nombre ?? id;
export const metodosSeleccionables = (): TipoPago[] => METODOS.filter((m) => m.disponible).map((m) => m.id);
