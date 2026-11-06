// Permisos de la sección 6. Se validan en el servidor; ocultar botones no basta.
//
// Tres roles:
//  - Administrador: todo, incluidos los ajustes, los usuarios, los canales y el asistente.
//  - Jefe de tienda: ve y gestiona todo lo operativo (conversaciones, contactos, pedidos, pagos, catálogo y existencias,
//    reportes y el estado del equipo), pero NO cambia ajustes, usuarios, canales, cuentas bancarias ni el asistente.
//  - Agente (asesor): atiende lo que se le asigna.
export type Rol = "admin" | "jefe_tienda" | "agente";
export const ROLES: readonly Rol[] = ["admin", "jefe_tienda", "agente"];
export const NOMBRE_ROL: Record<Rol, string> = { admin: "Administrador", jefe_tienda: "Jefe de tienda", agente: "Agente" };

export type Actor = { id: string; rol: Rol };
type ConDueno = { asignadaAId: string | null };

export const esAdmin = (u: { rol: Rol }) => u.rol === "admin";
/** Administrador o jefe de tienda: no se les limita lo que ven y pueden gestionar todo lo operativo. */
export const veTodo = (u: { rol: Rol }) => u.rol !== "agente";

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
export const puedeVerificarPagos = (u: ActorPedido) => veTodo(u) || u.puedeVerificarPagos === true;
/** Cancelar: administrador y jefe de tienda siempre; un asesor solo lo que creó y mientras no haya un pago verificado. */
export const puedeCancelarPedido = (u: Actor, p: { creadoPorId: string | null }, hayPagoVerificado: boolean) => veTodo(u) || (p.creadoPorId === u.id && !hayPagoVerificado);
