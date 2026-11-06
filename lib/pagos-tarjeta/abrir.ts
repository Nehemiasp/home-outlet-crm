import { db } from "@/lib/db";
import { pasarela } from "./index";

type Fallo = { ok: false; error: string };

/**
 * Abre el cobro con tarjeta de un pedido por `monto` (centavos) y devuelve su enlace. Hay un solo cobro vivo por pedido:
 * si ya hay uno abierto por ese mismo monto se reutiliza, y si se pide otro monto el anterior se cancela. No toca el estado
 * del pedido ni le avisa al cliente: eso lo hace quien llama. Vive aparte de `cobros.ts` para que `pedidos.ts` lo use sin ciclos.
 */
export async function abrirCobro(p: { pedidoId: string; codigo: string; monto: number; creadoPorId: string }): Promise<{ ok: true; cobroId: string; url: string; reutilizado: boolean } | Fallo> {
  const g = pasarela();
  if (!g) return { ok: false, error: "No hay una pasarela de pago conectada." };
  if (!(p.monto > 0)) return { ok: false, error: "No hay saldo por cobrar." };
  const abierto = await db.cobroTarjeta.findFirst({ where: { pedidoId: p.pedidoId, estado: "creado", monto: p.monto }, orderBy: { creado: "desc" } });
  if (abierto) return { ok: true, cobroId: abierto.id, url: abierto.url, reutilizado: true };

  const nuevo = await g.crearCobro({ referencia: p.codigo, monto: p.monto, descripcion: `Pedido ${p.codigo}` }).catch(() => null);
  if (!nuevo) return { ok: false, error: "La pasarela no respondió. Intente de nuevo en un momento." };
  await cancelarCobrosAbiertos(p.pedidoId); // el anterior (por otro monto) ya no vale
  const c = await db.cobroTarjeta.create({ data: { pedidoId: p.pedidoId, pasarela: g.nombre, externoId: nuevo.externoId, monto: p.monto, url: nuevo.url, creadoPorId: p.creadoPorId } });
  return { ok: true, cobroId: c.id, url: c.url, reutilizado: false };
}

/**
 * Anula los cobros abiertos de un pedido (por ejemplo, el cliente prefirió otra forma de pago). Con un proveedor real el enlace
 * podría seguir vivo: si aun así lo pagan, el aviso llega y queda «en revisión» para una persona (ver `procesarEventoPasarela`).
 */
export const cancelarCobrosAbiertos = (pedidoId: string) => db.cobroTarjeta.updateMany({ where: { pedidoId, estado: "creado" }, data: { estado: "cancelado", resueltoEn: new Date() } });
