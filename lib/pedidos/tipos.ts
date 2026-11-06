// Datos de pedidos que viajan entre el servidor y las pantallas (todo serializable).
import type { EstadoPedido } from "@/generated/prisma/client";

export type ProductoPedido = {
  id: string;
  nombre: string;
  sku: string;
  precioCentavos: number;
  imagenUrl?: string;
  /** Disponible en total (cantidad − apartado). */
  disponible: number;
  apartado: number;
  ubicaciones: { id: string; nombre: string; disponible: number; apartado: number }[];
};

export type EntradaPedido = {
  pedidoId: string | null;
  conversacionId: string;
  cliente: { nombre: string; telefono: string; municipio: string };
  lineas: { productoId: string; cantidad: number; ubicacionId: string | null }[];
  entrega: "recoger" | "envio";
  direccion: string;
  referencia: string;
  descuento: { tipo: "monto" | "porcentaje"; valor: string } | null;
  descuentoMotivo: string;
  notas: string;
};

export type VistaPedido = {
  lineas: { productoId: string; nombre: string; cantidad: number; precio: number; ubicacionId: string | null; total: number }[];
  subtotal: number;
  descuentoMonto: number;
  costoEnvio: number;
  total: number;
  zona: { nombre: string; tiempo: string } | null;
  /** Cosas a tener en cuenta que no impiden guardar, por ejemplo existencias que no alcanzan. */
  avisos: string[];
  /** Si algo no alcanza, enviar al cliente solo se puede como «sobre pedido» (admin). */
  sinExistencia: boolean;
};

export type AbiertoPedido = { id: string; codigo: string; estado: EstadoPedido; total: number; entrega: "recoger" | "envio" };

export type DatosPanelPedido = {
  contacto: { nombre: string; telefono: string; municipio: string };
  sinLimites: boolean;
  descuentoMaxAgente: number;
  inventario: "separado" | "compartido";
  ubicaciones: { id: string; nombre: string }[];
  ubicacionPorEntrega: { recoger: string | null; envio: string | null };
  envioGratisDesde: number | null;
  zonas: { nombre: string; municipios: string[]; costo: number; tiempo: string }[];
  abiertos: AbiertoPedido[];
  sugeridos: ProductoPedido[];
};

export type ResultadoPedido<T = object> = ({ ok: true } & T) | { ok: false; error: string };
