export type Ubicacion = { id: string; nombre: string };
export type CategoriaDTO = { id: string; nombre: string };

export type FiltrosCatalogo = { q: string; categoriaId: string; estado: "todos" | "activos" | "inactivos"; pagina: number };

export type FilaProducto = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  precioCentavos: number;
  activo: boolean;
  imagen: string | null;
  existencias: Record<string, number>; // por id de ubicación (lo que hay físicamente)
  apartados: Record<string, number>; // lo que tienen reservado los pedidos pendientes de pago
};

export type ProductoDetalle = {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string;
  categoriaId: string;
  precioCentavos: number;
  activo: boolean;
  imagenes: string[];
  existencias: Record<string, number>;
  mensajesEnviados: number;
};

export type DatosProducto = {
  sku: string;
  nombre: string;
  descripcion: string;
  categoriaId: string; // "" = sin categoría
  precio: string; // lo que escribió la persona, p. ej. "1,250.00"
  activo: boolean;
  imagenes: string[];
  existencias: Record<string, number>;
};

export type FilaVistaPrevia = {
  linea: number;
  sku: string;
  nombre: string;
  categoria: string;
  categoriaNueva: boolean;
  precioCentavos: number;
  tienda: number;
  enLinea: number;
  accion: "crear" | "actualizar" | "error";
  errores: string[];
};
