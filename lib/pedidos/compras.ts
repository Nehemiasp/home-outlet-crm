import { db } from "@/lib/db";
import type { EstadoPedido, Prisma } from "@/generated/prisma/client";
import { DESCONTADOS } from "./estados";

export type Compras = {
  cantidad: number;
  /** Suma de los pedidos con el pago ya verificado (pagado en adelante). */
  totalComprado: number;
  pedidos: { id: string; codigo: string; fecha: string; total: number; estado: EstadoPedido }[];
};

/** Los pedidos de un contacto, del más reciente al más antiguo. */
/** `visible` limita los pedidos a los que la persona puede ver (un asesor solo ve los de sus conversaciones). */
export async function comprasDeContacto(contactoId: string, visible: Prisma.OrderWhereInput = {}): Promise<Compras> {
  const filas = await db.order.findMany({ where: { contactoId, estado: { not: "borrador" }, ...visible }, orderBy: { creada: "desc" }, select: { id: true, codigo: true, creada: true, total: true, estado: true } });
  return {
    cantidad: filas.length,
    totalComprado: filas.filter((o) => DESCONTADOS.includes(o.estado)).reduce((t, o) => t + o.total, 0),
    pedidos: filas.map((o) => ({ id: o.id, codigo: o.codigo, fecha: o.creada.toISOString(), total: o.total, estado: o.estado })),
  };
}
