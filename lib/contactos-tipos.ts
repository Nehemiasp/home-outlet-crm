import type { Channel } from "@/lib/canales/tipos";
import type { EstadoConv } from "@/lib/bandeja-tipos";
import type { Compras } from "@/lib/pedidos/compras";

export type FiltrosContactos = {
  q: string;
  etiquetaId: string; // "" = todas
  canal: "todos" | Channel;
  /** Solo para administradores: «todos», «sin» (sin asesor responsable) o el id de un asesor. */
  asesor: string;
  orden: { clave: "nombre" | "ultimo"; dir: "asc" | "desc" };
  pagina: number;
};

export type FilaContacto = {
  id: string;
  nombre: string;
  telefono: string | null;
  canales: Channel[];
  etiquetas: { id: string; nombre: string; color: string }[];
  ultimoContacto: string | null; // ISO
};

export type ContactoMini = { id: string; nombre: string; telefono: string | null };

export type ContactoDetalle = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  etiquetas: { id: string; nombre: string; color: string }[];
  identidades: { canal: Channel; alias: string | null; externalContactId: string }[];
  etiquetasDisponibles: { id: string; nombre: string; color: string }[];
  conversaciones: { id: string; canal: Channel; estado: EstadoConv; fecha: string; ultimo: string }[];
  compras: Compras;
};
