import { log } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { puedeCancelarPedido, puedeSobrePedido, type ActorPedido } from "@/lib/permisos";
import type { EstadoPedido } from "@/generated/prisma/client";
import { avisarCliente, type ResultadoAviso } from "./avisos";
import { ETIQUETA_ESTADO } from "./estados";
import { cambiarEstado } from "./flujo";
import { lineaDeSistema } from "./pedidos";
import { veTodo } from "@/lib/permisos";

type Actor = ActorPedido & { nombre: string };
type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** Lo que una persona puede pedir a mano. Los pasos de pago (en revisión, pagado) salen de verificar los comprobantes. */
const MANUALES: readonly EstadoPedido[] = ["preparando", "listo_para_recoger", "enviado", "entregado", "cancelado", "pendiente_pago"];
const AVISA: Partial<Record<EstadoPedido, "listo_para_recoger" | "enviado">> = { listo_para_recoger: "listo_para_recoger", enviado: "enviado" };

/** Pasa el pedido a otro estado desde el detalle: preparando, listo, enviado (con guía), entregado, cancelar o reactivar uno vencido. */
export async function avanzarPedido(pedidoId: string, a: EstadoPedido, actor: Actor, o: { guia?: string; sobrePedido?: boolean } = {}): Promise<{ ok: true; aviso?: ResultadoAviso } | Fallo> {
  if (!MANUALES.includes(a)) return fallo("Ese cambio se hace verificando los comprobantes de pago.");
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, creadoPorId: true, codigo: true, conversacionId: true, pagos: { where: { estado: "verificado" }, select: { id: true } } } });
  if (!p) return fallo("El pedido no existe.");
  if (a === "pendiente_pago" && p.estado !== "vencido") return fallo("Solo se reactiva un pedido vencido.");
  if (a === "cancelado" && !puedeCancelarPedido(actor, p, p.pagos.length > 0)) return fallo(veTodo(actor) ? "No se puede cancelar este pedido." : "Solo puede cancelar los pedidos que creó y que todavía no tienen un pago verificado.");
  if (o.sobrePedido && !puedeSobrePedido(actor)) return fallo("Solo un administrador o un jefe de tienda puede apartar «sobre pedido».");
  const guia = o.guia?.trim();
  if (guia && guia.length > 60) return fallo("La guía pasa de 60 caracteres.");

  const r = await cambiarEstado({ pedidoId, a, quien: { usuarioId: actor.id }, sobrePedido: a === "pendiente_pago" ? !!o.sobrePedido : undefined, nota: a === "enviado" && guia ? `Guía ${guia}` : undefined });
  if (!r.ok) return r;
  if (guia && a === "enviado") await db.order.update({ where: { id: pedidoId }, data: { guia } });
  await log(actor, a === "cancelado" ? "cancelar_pedido" : "estado_pedido", "Order", pedidoId, { codigo: p.codigo, de: p.estado, a });
  if (p.conversacionId) await lineaDeSistema(actor, p.conversacionId, `${actor.nombre} pasó el pedido ${p.codigo} a «${ETIQUETA_ESTADO[a].toLowerCase()}»`);
  const clave = AVISA[a];
  return { ok: true, aviso: clave ? await avisarCliente(pedidoId, clave, { usuarioId: actor.id }) : undefined };
}

/** Guarda o corrige el número de guía mientras el pedido no se haya entregado. */
export async function guardarGuia(pedidoId: string, guia: string, actor: Actor): Promise<{ ok: true } | Fallo> {
  const g = guia.trim();
  if (g.length > 60) return fallo("La guía pasa de 60 caracteres.");
  const p = await db.order.findUnique({ where: { id: pedidoId }, select: { estado: true, codigo: true, entrega: true } });
  if (!p) return fallo("El pedido no existe.");
  if (p.entrega !== "envio") return fallo("Solo los pedidos con envío llevan guía.");
  if (!["pagado", "preparando", "enviado"].includes(p.estado)) return fallo("La guía se escribe cuando el pedido ya está pagado y todavía no se entregó.");
  await db.order.update({ where: { id: pedidoId }, data: { guia: g || null } });
  await log(actor, "guia_pedido", "Order", pedidoId, { codigo: p.codigo, guia: g });
  return { ok: true };
}
