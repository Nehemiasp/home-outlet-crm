// Las dos tiendas de Home Outlet (9-nov-2026). Son las ubicaciones del inventario y los lugares donde el cliente recoge.
// Sin dependencias: lo usan también las semillas y la limpieza.

export const TIENDA_PUERTO_BARRIOS = {
  nombre: "Tienda Puerto Barrios",
  direccion: "7a. avenida y 10a. calle, zona 1, Puerto Barrios, Izabal, frente al parque. Hay parqueo.",
};

export const TIENDA_MIXCO = {
  nombre: "Tienda Mixco",
  direccion: "4 calle 11-47 zona 2 de Mixco, colonia Santa Mónica, Guatemala",
};

/** En este orden se muestran: Puerto Barrios primero. */
export const TIENDAS = [TIENDA_PUERTO_BARRIOS, TIENDA_MIXCO] as const;

/** Para ordenar listas de tiendas: Puerto Barrios primero y las demás por nombre. */
export const compararTiendas = (a: { nombre: string }, b: { nombre: string }) =>
  a.nombre === TIENDA_PUERTO_BARRIOS.nombre ? -1 : b.nombre === TIENDA_PUERTO_BARRIOS.nombre ? 1 : a.nombre.localeCompare(b.nombre, "es");
