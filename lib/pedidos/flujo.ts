import { db } from "@/lib/db";
import type { EstadoPedido } from "@/generated/prisma/client";
import { obtenerAjustesPedidos } from "./ajustes";
import { DESCONTADOS, ETIQUETA_ESTADO, RESERVAN, transicionValida } from "./estados";
import { apartar, descontar, liberar, reponer, SinExistencia } from "./existencias";

export type QuienCambia = { usuarioId: string } | "sistema" | "asistente";
export type ResultadoEstado = { ok: true; estado: EstadoPedido } | { ok: false; error: string };

/**
 * Pasa un pedido a otro estado: valida la transición, mueve las existencias (apartar, descontar, liberar o reponer)
 * y deja el OrderEvent. Todo en una transacción: si algo falla no queda nada a medias.
 * `sobrePedido` solo lo pasa quien ya comprobó que es admin.
 */
export async function cambiarEstado(p: { pedidoId: string; a: EstadoPedido; quien: QuienCambia; nota?: string; sobrePedido?: boolean }): Promise<ResultadoEstado> {
  try {
    return await db.$transaction(async (tx) => {
      const pedido = await tx.order.findUnique({ where: { id: p.pedidoId }, select: { estado: true, entrega: true, sobrePedido: true } });
      if (!pedido) return { ok: false, error: "El pedido no existe." } as const;
      const de = pedido.estado;
      if (!transicionValida(de, p.a, pedido.entrega)) return { ok: false, error: `Un pedido ${ETIQUETA_ESTADO[de].toLowerCase()} no puede pasar a ${ETIQUETA_ESTADO[p.a].toLowerCase()}.` } as const;

      // Solo el primero que llega cambia el estado; si dos personas lo intentan a la vez, la otra recibe este aviso.
      if ((await tx.order.updateMany({ where: { id: p.pedidoId, estado: de }, data: { estado: p.a } })).count === 0) return { ok: false, error: "El pedido acaba de cambiar. Ábralo de nuevo." } as const;

      const reservaba = RESERVAN.includes(de);
      if (p.a === "pendiente_pago" && !reservaba) {
        const aj = await obtenerAjustesPedidos(tx);
        const o = await tx.order.findUniqueOrThrow({ where: { id: p.pedidoId }, select: { entrega: true } });
        const sobrePedido = !!p.sobrePedido;
        await apartar(tx, p.pedidoId, { modo: aj.inventario, ubicacionDespacho: o.entrega === "recoger" ? aj.ubicacionRecogerId : aj.ubicacionEnvioId, sobrePedido });
        await tx.order.update({ where: { id: p.pedidoId }, data: { reservadoHasta: new Date(Date.now() + aj.horasReserva * 3_600_000), sobrePedido } });
      } else if (p.a === "pagado") {
        await descontar(tx, p.pedidoId);
        await tx.order.update({ where: { id: p.pedidoId }, data: { reservadoHasta: null } });
        // Quien cerró la venta pasa a ser el asesor responsable del cliente (si fue un asesor, no un administrador).
        const venta = await tx.order.findUnique({ where: { id: p.pedidoId }, select: { contactoId: true, creadoPor: { select: { id: true, rol: true } } } });
        if (venta?.creadoPor?.rol === "agente") await tx.contact.update({ where: { id: venta.contactoId }, data: { asesorResponsableId: venta.creadoPor.id } });
      } else if ((p.a === "cancelado" || p.a === "vencido") && reservaba) {
        await liberar(tx, p.pedidoId);
      } else if (p.a === "cancelado" && DESCONTADOS.includes(de)) {
        await reponer(tx, p.pedidoId);
      }

      await tx.orderEvent.create({
        data: { pedidoId: p.pedidoId, deEstado: de, aEstado: p.a, nota: p.nota, ...(typeof p.quien === "string" ? { origen: p.quien } : { usuarioId: p.quien.usuarioId }) },
      });
      return { ok: true, estado: p.a } as const;
    });
  } catch (e) {
    if (e instanceof SinExistencia) return { ok: false, error: e.message };
    throw e;
  }
}
