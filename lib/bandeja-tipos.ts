// Datos que viajan entre el servidor y las pantallas de la bandeja (todo serializable).
import type { Channel } from "@/lib/canales/tipos";
import type { Compras } from "@/lib/pedidos/compras";
import type { EstadoPedido } from "@/generated/prisma/client";
import type { Rol } from "@/lib/permisos";

export type EstadoConv = "abierta" | "pendiente" | "cerrada";
export type Entrega = "enviando" | "enviado" | "entregado" | "leido" | "fallo";

export type Atencion = "asistente" | "esperando" | "asesor" | "ninguna";
export type Autor = "cliente" | "asesor" | "asistente";

export type Filtros = {
  tab: "sin-asignar" | "mias" | "todas";
  atencion: "todas" | "asistente" | "esperando";
  estado: "todos" | EstadoConv;
  canal: "todos" | Channel;
  /** Solo para administradores: «todos», «sin» (sin asesor) o el id de un asesor. */
  asesor: string;
  q: string;
  limite: number;
};

export type ItemLista = {
  id: string;
  nombre: string;
  canal: Channel;
  ultimo: string;
  hora: string; // ISO
  noLeidos: number;
  estado: EstadoConv;
  atencion: Atencion;
  asesor: string | null;
};

/** Cuántas conversaciones abiertas hay en cada pestaña de la lista. */
export type ContadoresLista = { sinAsignar: number; mias: number };

export type AsesorMini = { id: string; nombre: string };

/** El resumen de un pedido tal como se ve dentro del CRM (al cliente le llega el mismo texto plano). */
export type TarjetaPedido = {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  lineas: { nombre: string; cantidad: number; total: number }[];
  descuento: number;
  envio: string;
  total: number;
  cuentas: { banco: string; tipo: "monetaria" | "ahorro"; numero: string; titular: string }[];
};

/** Tono de un mensaje de sistema, para el ícono y el color. */
export type TonoSistema = "neutro" | "info" | "aviso" | "exito" | "peligro";

export type ProductoDTO = { id: string; nombre: string; sku: string; precioCentavos: number; existencia: number; imagenUrl?: string };

export type ItemLinea =
  | { clase: "mensaje"; id: string; entrante: boolean; tipo: string; texto: string | null; archivoUrl: string | null; producto: ProductoDTO | null; estado: Entrega | null; autor: string | null; quien: Autor; consultado: string[]; pedido: TarjetaPedido | null; fecha: string }
  | { clase: "nota"; id: string; texto: string; autor: string; fecha: string }
  | { clase: "sistema"; id: string; texto: string; tono: TonoSistema; fecha: string };

export type EtiquetaDTO = { id: string; nombre: string; color: string };

export type ConversacionDTO = {
  id: string;
  canal: Channel;
  estado: EstadoConv;
  atencion: Atencion;
  motivo: string | null;
  resumen: { texto: string; creado: string } | null;
  modoDePrueba: boolean;
  asignadaA: { id: string; nombre: string } | null;
  lastInboundAt: string | null;
  canalActivo: boolean;
  linea: ItemLinea[];
  contacto: {
    id: string;
    nombre: string;
    telefono: string | null;
    correo: string | null;
    notas: string | null;
    etiquetas: EtiquetaDTO[];
    identidades: { canal: Channel; alias: string | null; externalContactId: string }[];
  };
  historial: { id: string; canal: Channel; estado: EstadoConv; fecha: string; ultimo: string }[];
  etiquetasDisponibles: EtiquetaDTO[];
  respuestasRapidas: { atajo: string; texto: string }[];
  usuarios: { id: string; nombre: string }[];
  yo: { id: string; rol: Rol };
  /** Pedidos de la conversación que esperan pago: para registrar el comprobante que manda el cliente. */
  compras: Compras;
  pedidosAbiertos: { id: string; codigo: string; estado: string; total: number; saldo: number }[];
  comprobante: { metodos: { id: string; nombre: string }[]; bancos: string[] };
};
