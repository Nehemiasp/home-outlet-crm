import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { pasarela } from "./index";

type Fallo = { ok: false; error: string };

/**
 * El enlace de pago con tarjeta que pega la persona (lo genera el negocio en su plataforma, hoy Paggo). Tiene que ser una dirección
 * https completa; no se comprueba el dominio porque la plataforma puede cambiar.
 */
export function validarEnlacePago(texto?: string | null): { ok: true; url: string } | Fallo {
  const t = (texto ?? "").trim();
  if (!t) return { ok: false, error: "Pegue el enlace de pago con tarjeta (el que genera Paggo por el monto del pedido)." };
  if (t.length > 500) return { ok: false, error: "El enlace es demasiado largo. Revíselo." };
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, error: "Ese enlace no es válido. Cópielo completo, empezando con https://" };
  }
  if (u.protocol !== "https:" || !u.hostname.includes(".")) return { ok: false, error: "El enlace de pago tiene que empezar con https://" };
  return { ok: true, url: t };
}

/**
 * Abre el cobro con tarjeta de un pedido por `monto` (centavos) y devuelve su enlace. Hay un solo cobro vivo por pedido:
 * si ya hay uno abierto por ese mismo monto (y el mismo enlace) se reutiliza, y si cambia el anterior se cancela. No toca el
 * estado del pedido ni le avisa al cliente: eso lo hace quien llama. Vive aparte de `cobros.ts` para que `pedidos.ts` lo use sin ciclos.
 *
 * Hoy el cobro es **manual**: `enlace` es el enlace de pago que la persona pega (lo genera el negocio en Paggo) y el pago se
 * confirma registrando el comprobante. La pasarela automática solo se usa si está conectada (PASARELA) y no se pegó un enlace.
 */
export async function abrirCobro(p: { pedidoId: string; codigo: string; monto: number; creadoPorId: string; enlace?: string | null }): Promise<{ ok: true; cobroId: string; url: string; reutilizado: boolean } | Fallo> {
  if (!(p.monto > 0)) return { ok: false, error: "No hay saldo por cobrar." };
  const g = pasarela();
  if (p.enlace?.trim() || !g) {
    const v = validarEnlacePago(p.enlace);
    if (!v.ok) return v;
    const igual = await db.cobroTarjeta.findFirst({ where: { pedidoId: p.pedidoId, estado: "creado", monto: p.monto, url: v.url }, orderBy: { creado: "desc" } });
    if (igual) return { ok: true, cobroId: igual.id, url: igual.url, reutilizado: true };
    await cancelarCobrosAbiertos(p.pedidoId); // el enlace anterior ya no vale
    const c = await db.cobroTarjeta.create({ data: { pedidoId: p.pedidoId, pasarela: "manual", externoId: `manual-${randomUUID()}`, monto: p.monto, url: v.url, creadoPorId: p.creadoPorId } });
    return { ok: true, cobroId: c.id, url: c.url, reutilizado: false };
  }
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
