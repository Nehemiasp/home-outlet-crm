// Permisos de la sección 6. Se validan en el servidor; ocultar botones no basta.
export type Actor = { id: string; rol: "admin" | "agente" };
type ConDueno = { asignadaAId: string | null };

const esAdmin = (u: Actor) => u.rol === "admin";

/** Admin asigna a cualquiera o quita la asignación. Un agente solo se asigna a sí mismo, y solo si está libre o ya es suya. */
export const puedeAsignar = (u: Actor, c: ConDueno, destinoId: string | null) =>
  esAdmin(u) || (destinoId === u.id && (c.asignadaAId === null || c.asignadaAId === u.id));

/** Admin cierra cualquiera; un agente solo las que tiene asignadas. */
export const puedeCerrar = (u: Actor, c: ConDueno) => esAdmin(u) || c.asignadaAId === u.id;

export const puedeUnirContactos = esAdmin;
export const puedeGestionarProductos = esAdmin; // crear, editar y borrar
export const puedeVerAjustes = esAdmin; // ajustes, usuarios, simulador y /sistema
export const puedeVerReportes = esAdmin; // reportes de atención, ventas por canal y costo del asistente

/* ── Pedidos (fase 2.5) ── */
export type ActorPedido = Actor & { puedeVerificarPagos?: boolean };

/** Descuento sobre el límite del agente y «Sobre pedido»: solo admin. Dentro del límite, cualquiera. */
export const puedeDescontar = (u: Actor, descuentoMonto: number, subtotal: number, limiteAgentePorcentaje: number) =>
  esAdmin(u) || descuentoMonto * 100 <= subtotal * limiteAgentePorcentaje;
export const puedeSobrePedido = esAdmin;
/** Verificar o rechazar un pago: admin, o un agente al que se lo activaron en Ajustes → Usuarios. */
export const puedeVerificarPagos = (u: ActorPedido) => esAdmin(u) || u.puedeVerificarPagos === true;
/** Cancelar: admin siempre; un agente solo lo que creó y mientras no haya un pago verificado. */
export const puedeCancelarPedido = (u: Actor, p: { creadoPorId: string | null }, hayPagoVerificado: boolean) => esAdmin(u) || (p.creadoPorId === u.id && !hayPagoVerificado);
