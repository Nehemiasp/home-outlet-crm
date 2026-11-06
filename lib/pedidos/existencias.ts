import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
export type StockFila = { cantidad: number; apartado: number };

/** Lo que se puede vender de una ubicación: cantidad − apartado, sin bajar de cero. */
export const disponibleDe = (s: StockFila) => Math.max(0, s.cantidad - s.apartado);
export const disponibleProducto = (stocks: readonly StockFila[]) => stocks.reduce((t, s) => t + disponibleDe(s), 0);
export const apartadoProducto = (stocks: readonly StockFila[]) => stocks.reduce((t, s) => t + s.apartado, 0);

/** "Disponible 5 · Apartado 2" */
export const textoExistencia = (stocks: readonly StockFila[]) => `Disponible ${disponibleProducto(stocks)} · Apartado ${apartadoProducto(stocks)}`;

export class SinExistencia extends Error {}

export type OpcionesApartado = {
  modo: "separado" | "compartido";
  /** Ubicación de despacho por defecto: de ahí sale primero la mercancía. */
  ubicacionDespacho: string | null;
  /** Un admin puede dejar apartar de más ("sobre pedido"). */
  sobrePedido: boolean;
};

/**
 * Aparta de una ubicación hasta `cantidad` unidades y dice cuántas pudo apartar.
 * El bloqueo de la fila (FOR UPDATE) hace que dos pedidos al mismo tiempo no aparten la misma unidad.
 */
async function tomar(tx: Tx, productoId: string, ubicacionId: string, cantidad: number): Promise<number> {
  const r = await tx.$queryRaw<{ tomar: number }[]>`
    WITH s AS (
      SELECT id, LEAST(${cantidad}::int, GREATEST(cantidad - apartado, 0)) AS tomar
      FROM "Stock" WHERE "productoId" = ${productoId} AND "ubicacionId" = ${ubicacionId} FOR UPDATE
    )
    UPDATE "Stock" t SET apartado = t.apartado + s.tomar FROM s WHERE t.id = s.id RETURNING s.tomar`;
  return r[0]?.tomar ?? 0;
}

/**
 * Aparta las existencias de un pedido. Con inventario compartido, lo que no alcanza en la ubicación
 * de despacho se toma de la otra y la línea se parte en dos (una por ubicación). Con inventario separado
 * solo cuenta la ubicación de la línea. Si algo no alcanza y no es sobre pedido, lanza SinExistencia:
 * quien llama lo hace dentro de una transacción y no queda nada apartado.
 */
export async function apartar(tx: Tx, pedidoId: string, o: OpcionesApartado) {
  const lineas = await tx.orderItem.findMany({ where: { pedidoId }, orderBy: { id: "asc" } });
  const ubicaciones = (await tx.location.findMany({ where: { activa: true }, select: { id: true }, orderBy: { nombre: "asc" } })).map((u) => u.id);
  const faltantes: string[] = [];

  for (const l of lineas) {
    if (!l.productoId) {
      faltantes.push(`${l.nombre} (ya no está en el catálogo)`);
      continue;
    }
    const primaria = l.ubicacionId ?? o.ubicacionDespacho ?? ubicaciones[0];
    if (!primaria) {
      faltantes.push(l.nombre);
      continue;
    }
    const candidatas = o.modo === "compartido" ? [primaria, ...ubicaciones.filter((u) => u !== primaria)] : [primaria];

    const tomas: { ubicacionId: string; cantidad: number }[] = [];
    let falta = l.cantidad;
    for (const u of candidatas) {
      if (falta === 0) break;
      const t = await tomar(tx, l.productoId, u, falta);
      if (t > 0) {
        tomas.push({ ubicacionId: u, cantidad: t });
        falta -= t;
      }
    }
    if (falta > 0) {
      if (!o.sobrePedido) {
        faltantes.push(l.nombre);
        continue;
      }
      // Sobre pedido: se aparta de más en la ubicación principal; la existencia queda por debajo de lo apartado hasta que llegue mercancía.
      await tx.stock.upsert({
        where: { productoId_ubicacionId: { productoId: l.productoId, ubicacionId: primaria } },
        create: { productoId: l.productoId, ubicacionId: primaria, cantidad: 0, apartado: falta },
        update: { apartado: { increment: falta } },
      });
      const previa = tomas.find((t) => t.ubicacionId === primaria);
      if (previa) previa.cantidad += falta;
      else tomas.unshift({ ubicacionId: primaria, cantidad: falta });
    }

    const [primera, ...resto] = tomas;
    await tx.orderItem.update({ where: { id: l.id }, data: { ubicacionId: primera!.ubicacionId, cantidad: primera!.cantidad } });
    for (const t of resto) await tx.orderItem.create({ data: { pedidoId, productoId: l.productoId, sku: l.sku, nombre: l.nombre, precio: l.precio, cantidad: t.cantidad, ubicacionId: t.ubicacionId } });
  }

  if (faltantes.length) throw new SinExistencia(`No hay existencia suficiente de: ${faltantes.join(", ")}.`);
}

/** Devuelve lo apartado (pedido cancelado o vencido). */
export async function liberar(tx: Tx, pedidoId: string) {
  for (const l of await tx.orderItem.findMany({ where: { pedidoId } }))
    if (l.productoId && l.ubicacionId) await tx.$executeRaw`UPDATE "Stock" SET apartado = GREATEST(apartado - ${l.cantidad}::int, 0) WHERE "productoId" = ${l.productoId} AND "ubicacionId" = ${l.ubicacionId}`;
}

/** El pago se verificó: las unidades salen de la existencia y dejan de estar apartadas. */
export async function descontar(tx: Tx, pedidoId: string) {
  for (const l of await tx.orderItem.findMany({ where: { pedidoId } }))
    if (l.productoId && l.ubicacionId)
      await tx.$executeRaw`UPDATE "Stock" SET cantidad = GREATEST(cantidad - ${l.cantidad}::int, 0), apartado = GREATEST(apartado - ${l.cantidad}::int, 0) WHERE "productoId" = ${l.productoId} AND "ubicacionId" = ${l.ubicacionId}`;
}

/** Se cancela un pedido ya descontado: las unidades vuelven a la existencia. */
export async function reponer(tx: Tx, pedidoId: string) {
  for (const l of await tx.orderItem.findMany({ where: { pedidoId } }))
    if (l.productoId && l.ubicacionId) await tx.$executeRaw`UPDATE "Stock" SET cantidad = cantidad + ${l.cantidad}::int WHERE "productoId" = ${l.productoId} AND "ubicacionId" = ${l.ubicacionId}`;
}
