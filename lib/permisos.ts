// Permisos de la sección 6. Se validan en el servidor; ocultar botones no basta.
//
// Cuatro roles:
//  - Administrador: todo, incluidos los ajustes, los usuarios, los canales y el asistente.
//  - Jefe de tienda: ve y gestiona todo lo operativo (conversaciones, contactos, pedidos, pagos, catálogo y existencias,
//    reportes y el estado del equipo), pero NO cambia ajustes, usuarios, canales, cuentas bancarias ni el asistente.
//  - Agente (asesor): atiende lo que se le asigna.
//  - Bodega: solo ve el catálogo y despacha los pedidos ya pagados (sin precios, pagos, conversaciones ni contactos).
//    A diferencia de los otros, NO entra a ninguna pantalla ni acción salvo las que lo permiten expresamente (ver `lib/session.ts`).
export type Rol = "admin" | "jefe_tienda" | "agente" | "bodega";
export const ROLES = ["admin", "jefe_tienda", "agente", "bodega"] as const satisfies readonly Rol[];
export const NOMBRE_ROL: Record<Rol, string> = { admin: "Administrador", jefe_tienda: "Jefe de tienda", agente: "Agente", bodega: "Bodega" };

export type Actor = { id: string; rol: Rol };
type ConDueno = { asignadaAId: string | null };

export const esAdmin = (u: { rol: Rol }) => u.rol === "admin";
/** Administrador o jefe de tienda: no se les limita lo que ven y pueden gestionar todo lo operativo. */
export const veTodo = (u: { rol: Rol }) => u.rol === "admin" || u.rol === "jefe_tienda";

/** Bodega: solo catálogo (sin editar ni ajustar existencias) y despacho. */
export const esBodega = (u: { rol: Rol }) => u.rol === "bodega";
/** La pantalla de despacho y sus acciones: bodega, y también el administrador y el jefe de tienda (que ya ven y gestionan los pedidos completos). Un agente no. */
export const puedeDespachar = (u: { rol: Rol }) => esBodega(u) || veTodo(u);
/** Ajustar existencias a mano desde el catálogo: todos menos bodega, que solo mira. */
export const puedeAjustarExistencias = (u: { rol: Rol }) => !esBodega(u);
/** La pantalla donde empieza cada persona al entrar. */
export const inicioDe = (u: { rol: Rol }) => (esBodega(u) ? "/despacho" : "/bandeja");

/** Quien ve todo asigna a cualquiera o quita la asignación. Un asesor solo se asigna a sí mismo, y solo si está libre o ya es suya. */
export const puedeAsignar = (u: Actor, c: ConDueno, destinoId: string | null) =>
  veTodo(u) || (destinoId === u.id && (c.asignadaAId === null || c.asignadaAId === u.id));

/** Quien ve todo cierra cualquiera; un asesor solo las que tiene asignadas. */
export const puedeCerrar = (u: Actor, c: ConDueno) => veTodo(u) || c.asignadaAId === u.id;

export const puedeUnirContactos = veTodo;
export const puedeGestionarProductos = veTodo; // crear, editar y borrar, y las existencias
export const puedeVerAjustes = esAdmin; // ajustes, usuarios, simulador y /sistema: solo el administrador
export const puedeVerReportes = veTodo; // reportes de atención, ventas por canal y costo del asistente

/* ── Pedidos (fase 2.5) ── */
export type ActorPedido = Actor & { puedeVerificarPagos?: boolean };

/** Descuento sobre el límite del asesor y «Sobre pedido»: administrador y jefe de tienda. Dentro del límite, cualquiera. */
export const puedeDescontar = (u: Actor, descuentoMonto: number, subtotal: number, limiteAgentePorcentaje: number) =>
  veTodo(u) || descuentoMonto * 100 <= subtotal * limiteAgentePorcentaje;
export const puedeSobrePedido = veTodo;
/** Verificar o rechazar un pago: administrador y jefe de tienda, o un asesor al que se lo activaron en Ajustes → Usuarios. */
export const puedeVerificarPagos = (u: ActorPedido) => veTodo(u) || (!esBodega(u) && u.puedeVerificarPagos === true);
/** Cancelar: administrador y jefe de tienda siempre; un asesor solo lo que creó y mientras no haya un pago verificado. */
export const puedeCancelarPedido = (u: Actor, p: { creadoPorId: string | null }, hayPagoVerificado: boolean) => veTodo(u) || (p.creadoPorId === u.id && !hayPagoVerificado);
