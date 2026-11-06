import { tomarCandado } from "@/lib/candados";
import { db } from "@/lib/db";
import { avisarCliente, configMensajes } from "./avisos";
import { cambiarEstado } from "./flujo";
import { lineaDeSistema } from "./pedidos";

const AVISO_ANTES_MS = 2 * 3_600_000;
const ENTRE_CORRIDAS_MS = 30_000;

/**
 * Pasa a «vencido» los pedidos pendientes de pago cuya reserva ya terminó, libera sus unidades y le avisa al cliente.
 * Es barata e idempotente: se llama al abrir la lista o el detalle de pedidos y la bandeja, y desde el cron
 * (POST /api/tareas/vencer-reservas). Un pedido con un pago parcial ya verificado no vence: lo cancela una persona.
 * Devuelve cuántos venció. Corre como máximo cada 30 segundos entre todos los procesos (candado en la base), salvo que se pida `forzar`.
 */
export async function vencerReservas(o: { ahora?: Date; forzar?: boolean } = {}): Promise<number> {
  const ahora = o.ahora ?? new Date();
  if (!o.forzar && !(await tomarCandado("vencer-reservas", ENTRE_CORRIDAS_MS))) return 0;

  const vencidos = await db.order.findMany({
    where: { estado: "pendiente_pago", reservadoHasta: { lt: ahora }, pagos: { none: { estado: "verificado" } } },
    select: { id: true, codigo: true, conversacionId: true },
  });
  let n = 0;
  for (const p of vencidos) {
    const r = await cambiarEstado({ pedidoId: p.id, a: "vencido", quien: "sistema", nota: "La reserva terminó sin recibir el pago" });
    if (!r.ok) continue; // otra persona lo cambió justo ahora
    n++;
    if (p.conversacionId) await lineaDeSistema(null, p.conversacionId, `El pedido ${p.codigo} venció: no se recibió el pago a tiempo`);
    await avisarCliente(p.id, "vencido");
  }
  await recordarPorVencer(ahora);
  return n;
}

/** Aviso opcional (viene apagado) 2 horas antes de que venza. Se manda una sola vez por pedido. */
async function recordarPorVencer(ahora: Date) {
  if (!(await configMensajes()).por_vencer.activo) return;
  const cerca = await db.order.findMany({ where: { estado: "pendiente_pago", reservadoHasta: { gte: ahora, lte: new Date(ahora.getTime() + AVISO_ANTES_MS) } }, select: { id: true, codigo: true } });
  for (const p of cerca) {
    if (await db.activityLog.count({ where: { accion: "aviso_por_vencer", entidad: "Order", entidadId: p.id } })) continue;
    await db.activityLog.create({ data: { accion: "aviso_por_vencer", entidad: "Order", entidadId: p.id, detalle: { codigo: p.codigo } } });
    await avisarCliente(p.id, "por_vencer");
  }
}
