import { createHash } from "node:crypto";
import { almacenamiento, extensionDeImagen } from "@/lib/almacenamiento";
import { analizarProductosCsv, type FilaProductoCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/dinero";
import type { Prisma } from "@/generated/prisma/client";
import type { CategoriaDTO, DatosProducto, FilaProducto, FilaVistaPrevia, FiltrosCatalogo, ProductoDetalle, Ubicacion } from "@/lib/catalogo-tipos";
import { compararTiendas, TIENDA_MIXCO, TIENDA_PUERTO_BARRIOS, TIENDAS } from "@/lib/tiendas";

export const POR_PAGINA = 24;
export const MAX_IMAGENES = 5;

type Actor = { id: string; nombre: string };

/** Las dos tiendas, con Puerto Barrios primero. Si faltan, se crean con su dirección. */
export async function ubicaciones(): Promise<Ubicacion[]> {
  for (const t of TIENDAS) {
    if (!(await db.location.findUnique({ where: { nombre: t.nombre } }))) await db.location.create({ data: t });
  }
  const todas = await db.location.findMany({ where: { activa: true }, select: { id: true, nombre: true } });
  return todas.sort(compararTiendas);
}

export const categorias = (): Promise<CategoriaDTO[]> => db.category.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { id: true, nombre: true } });

const porUbicacion = (stock: { ubicacionId: string; cantidad: number }[], locs: Ubicacion[]) =>
  Object.fromEntries(locs.map((l) => [l.id, stock.find((s) => s.ubicacionId === l.id)?.cantidad ?? 0]));
const apartadosPorUbicacion = (stock: { ubicacionId: string; apartado: number }[], locs: Ubicacion[]) =>
  Object.fromEntries(locs.map((l) => [l.id, stock.find((s) => s.ubicacionId === l.id)?.apartado ?? 0]));

export async function listarProductos(f: FiltrosCatalogo) {
  const q = f.q.trim();
  const where: Prisma.ProductWhereInput = {
    ...(q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(f.estado === "activos" ? { activo: true } : f.estado === "inactivos" ? { activo: false } : {}),
  };
  const [locs, total] = await Promise.all([ubicaciones(), db.product.count({ where })]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, f.pagina), paginas);
  const filas = await db.product.findMany({
    where,
    orderBy: { nombre: "asc" },
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
    include: { categoria: { select: { nombre: true } }, stock: true },
  });
  return {
    ubicaciones: locs,
    total,
    paginas,
    filas: filas.map((p): FilaProducto => ({
      id: p.id, sku: p.sku, nombre: p.nombre, categoria: p.categoria?.nombre ?? null, precioCentavos: p.precio, activo: p.activo,
      imagen: p.imagenes[0] ?? null, existencias: porUbicacion(p.stock, locs), apartados: apartadosPorUbicacion(p.stock, locs),
    })),
  };
}

export async function cargarProducto(id: string): Promise<ProductoDetalle | null> {
  const [p, locs] = await Promise.all([db.product.findUnique({ where: { id }, include: { stock: true, _count: { select: { mensajes: true } } } }), ubicaciones()]);
  if (!p) return null;
  return {
    id: p.id, sku: p.sku, nombre: p.nombre, descripcion: p.descripcion ?? "", categoriaId: p.categoriaId ?? "", precioCentavos: p.precio, activo: p.activo,
    imagenes: p.imagenes, existencias: porUbicacion(p.stock, locs), mensajesEnviados: p._count.mensajes,
  };
}

/** Ajuste rápido: fija la cantidad de cada ubicación y deja un registro por cada cambio. */
export async function ajustarExistencias(productoId: string, cantidades: Record<string, number>, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id: productoId }, include: { stock: { include: { ubicacion: true } } } });
    if (!p) return { ok: false as const, error: "El producto ya no existe." };
    const locs = await tx.location.findMany({ where: { id: { in: Object.keys(cantidades) } } });
    for (const loc of locs) {
      const despues = cantidades[loc.id]!;
      const antes = p.stock.find((s) => s.ubicacionId === loc.id)?.cantidad ?? 0;
      if (antes === despues) continue;
      await tx.stock.upsert({ where: { productoId_ubicacionId: { productoId, ubicacionId: loc.id } }, create: { productoId, ubicacionId: loc.id, cantidad: despues }, update: { cantidad: despues } });
      await tx.activityLog.create({
        data: { usuarioId: actor.id, accion: "existencias", entidad: "Product", entidadId: productoId, detalle: { sku: p.sku, producto: p.nombre, ubicacion: loc.nombre, antes, despues, por: actor.nombre } },
      });
    }
    return { ok: true as const };
  });
}

const existenciaValida = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 999_999;

/** Crea (id nulo) o actualiza un producto con sus fotos y existencias. */
export async function guardarProducto(id: string | null, d: DatosProducto, actor: Actor): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sku = d.sku.trim();
  const nombre = d.nombre.trim();
  if (!nombre) return { ok: false, error: "Escriba el nombre del producto." };
  if (nombre.length > 120) return { ok: false, error: "El nombre pasa de 120 caracteres." };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(sku)) return { ok: false, error: "El SKU solo puede tener letras, números, punto, guion y guion bajo (máximo 40)." };
  const precio = parsePrecio(d.precio);
  if (precio === null || precio === 0) return { ok: false, error: "Escriba un precio mayor que cero, por ejemplo 1,250.00." };
  if (d.descripcion.length > 2000) return { ok: false, error: "La descripción pasa de 2000 caracteres." };
  if (d.imagenes.length > MAX_IMAGENES) return { ok: false, error: `Solo se permiten ${MAX_IMAGENES} fotos por producto.` };
  if (!Object.values(d.existencias).every(existenciaValida)) return { ok: false, error: "Las existencias deben ser números enteros, de 0 en adelante." };

  try {
    return await db.$transaction(async (tx) => {
      const datos = { sku, nombre, precio, descripcion: d.descripcion.trim() || null, categoriaId: d.categoriaId || null, activo: d.activo, imagenes: d.imagenes };
      const producto = id ? await tx.product.update({ where: { id }, data: datos }) : await tx.product.create({ data: datos });
      const locs = await tx.location.findMany({ where: { id: { in: Object.keys(d.existencias) } } });
      for (const loc of locs) {
        const cantidad = d.existencias[loc.id]!;
        const antes = id ? ((await tx.stock.findUnique({ where: { productoId_ubicacionId: { productoId: producto.id, ubicacionId: loc.id } } }))?.cantidad ?? 0) : 0;
        await tx.stock.upsert({ where: { productoId_ubicacionId: { productoId: producto.id, ubicacionId: loc.id } }, create: { productoId: producto.id, ubicacionId: loc.id, cantidad }, update: { cantidad } });
        if (id && antes !== cantidad) {
          await tx.activityLog.create({ data: { usuarioId: actor.id, accion: "existencias", entidad: "Product", entidadId: producto.id, detalle: { sku, producto: nombre, ubicacion: loc.nombre, antes, despues: cantidad, por: actor.nombre } } });
        }
      }
      await tx.activityLog.create({ data: { usuarioId: actor.id, accion: id ? "editar_producto" : "crear_producto", entidad: "Product", entidadId: producto.id, detalle: { sku, producto: nombre, por: actor.nombre } } });
      return { ok: true as const, id: producto.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: `Ya existe un producto con el SKU ${sku}.` };
    throw e;
  }
}

/** Borra el producto, salvo que ya se haya enviado a clientes: ahí se pierde la tarjeta en las conversaciones, y conviene desactivarlo. */
export async function borrarProducto(id: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await db.product.findUnique({ where: { id }, include: { _count: { select: { mensajes: true } } } });
  if (!p) return { ok: true };
  if (p._count.mensajes > 0) return { ok: false, error: "Este producto ya se envió en conversaciones y no se puede borrar. Puede desactivarlo para que deje de ofrecerse." };
  await db.$transaction([
    db.product.delete({ where: { id } }),
    db.activityLog.create({ data: { usuarioId: actor.id, accion: "borrar_producto", entidad: "Product", entidadId: id, detalle: { sku: p.sku, producto: p.nombre, por: actor.nombre } } }),
  ]);
  return { ok: true };
}

/* ── Fotos por SKU (varias a la vez, desde Importar) ── */

/**
 * A qué SKU pertenece un archivo por su nombre: el SKU más largo con el que empieza (sin distinguir mayúsculas),
 * seguido del final, «-», «_», «.» o un espacio. Así «HO-001-aspiradora.jpg» es de HO-001 y no de HO-0011.
 */
export function skuDeArchivo(nombreArchivo: string, skus: string[]): string | null {
  const n = nombreArchivo.trim().toLowerCase();
  let elegido: string | null = null;
  for (const sku of skus) {
    const s = sku.toLowerCase();
    if (!n.startsWith(s)) continue;
    const siguiente = n.charAt(s.length);
    if (siguiente !== "" && !"-_. ".includes(siguiente)) continue;
    if (!elegido || s.length > elegido.length) elegido = sku;
  }
  return elegido;
}

export type FotoPorSku = { ok: true; sku: string; producto: string; estado: "principal" | "agregada" | "repetida" } | { ok: false; error: string };

/**
 * Agrega la foto al producto cuyo SKU va al inicio del nombre del archivo. Si el producto no tenía fotos, queda como
 * principal; si ya tiene esa misma foto (mismo contenido), no se repite, así se puede volver a subir la carpeta sin duplicar.
 */
export async function asignarFotoPorSku(nombreArchivo: string, datos: Buffer, actor: Actor): Promise<FotoPorSku> {
  const ext = extensionDeImagen(datos);
  if (!ext) return { ok: false, error: "No es una imagen JPG, PNG o WebP." };
  const skus = (await db.product.findMany({ select: { sku: true } })).map((p) => p.sku);
  const sku = skuDeArchivo(nombreArchivo, skus);
  if (!sku) return { ok: false, error: "El nombre del archivo no empieza con el SKU de ningún producto." };
  const p = await db.product.findUniqueOrThrow({ where: { sku }, select: { id: true, nombre: true, imagenes: true } });

  const huella = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const nueva = huella(datos);
  for (const url of p.imagenes) {
    const actual = url.startsWith("/api/archivos/") ? await almacenamiento.leer(url.slice("/api/archivos/".length)) : null;
    if (actual && huella(actual) === nueva) return { ok: true, sku, producto: p.nombre, estado: "repetida" };
  }
  if (p.imagenes.length >= MAX_IMAGENES) return { ok: false, error: `${sku} ya tiene ${MAX_IMAGENES} fotos, que es el máximo. Quite alguna desde el producto.` };

  const { url } = await almacenamiento.guardar(datos, ext);
  await db.$transaction([
    db.product.update({ where: { id: p.id }, data: { imagenes: { push: url } } }),
    db.activityLog.create({ data: { usuarioId: actor.id, accion: "foto_por_sku", entidad: "Product", entidadId: p.id, detalle: { sku, archivo: nombreArchivo, por: actor.nombre } } }),
  ]);
  return { ok: true, sku, producto: p.nombre, estado: p.imagenes.length === 0 ? "principal" : "agregada" };
}

/* ── Importación desde CSV ── */

type Revisada = FilaProductoCsv & { existe: boolean; categoriaNueva: boolean };

async function revisar(texto: string): Promise<{ error?: string; filas: Revisada[] }> {
  const { error, filas } = analizarProductosCsv(texto);
  if (error) return { error, filas: [] };
  const [existentes, cats] = await Promise.all([
    db.product.findMany({ where: { sku: { in: filas.map((f) => f.sku).filter(Boolean) } }, select: { sku: true } }),
    categorias(),
  ]);
  const skus = new Set(existentes.map((p) => p.sku));
  const nombres = new Set(cats.map((c) => c.nombre.toLowerCase()));
  return { filas: filas.map((f) => ({ ...f, existe: skus.has(f.sku), categoriaNueva: !!f.categoria && !nombres.has(f.categoria.toLowerCase()) })) };
}

export async function previsualizarProductos(texto: string): Promise<{ error?: string; filas: FilaVistaPrevia[] }> {
  const r = await revisar(texto);
  return {
    error: r.error,
    filas: r.filas.map((f) => ({
      linea: f.linea, sku: f.sku, nombre: f.nombre, categoria: f.categoria, categoriaNueva: f.categoriaNueva, precioCentavos: f.precioCentavos, tienda: f.tienda, enLinea: f.enLinea,
      errores: f.errores, accion: f.errores.length ? "error" : f.existe ? "actualizar" : "crear",
    })),
  };
}

/** Importa las filas sin errores (crea o actualiza por SKU) y crea las categorías que falten. Las filas con errores se omiten. */
export async function importarProductos(texto: string, actor: Actor): Promise<{ error?: string; creados: number; actualizados: number; omitidas: number; categoriasNuevas: number }> {
  const r = await revisar(texto);
  if (r.error) return { error: r.error, creados: 0, actualizados: 0, omitidas: 0, categoriasNuevas: 0 };
  const validas = r.filas.filter((f) => f.errores.length === 0);
  const locs = await ubicaciones();
  const tienda = locs.find((u) => u.nombre === TIENDA_PUERTO_BARRIOS.nombre);
  const linea = locs.find((u) => u.nombre === TIENDA_MIXCO.nombre);

  const resultado = await db.$transaction(
    async (tx) => {
      const ids = new Map((await tx.category.findMany()).map((c) => [c.nombre.toLowerCase(), c.id]));
      let creados = 0;
      let actualizados = 0;
      let categoriasNuevas = 0;
      for (const f of validas) {
        let categoriaId: string | null = null;
        if (f.categoria) {
          const clave = f.categoria.toLowerCase();
          if (!ids.has(clave)) {
            ids.set(clave, (await tx.category.create({ data: { nombre: f.categoria, orden: ids.size } })).id);
            categoriasNuevas++;
          }
          categoriaId = ids.get(clave)!;
        }
        const datos = { nombre: f.nombre, precio: f.precioCentavos, descripcion: f.descripcion || null, categoriaId };
        const p = await tx.product.upsert({ where: { sku: f.sku }, create: { sku: f.sku, imagenes: [], ...datos }, update: datos });
        if (f.existe) actualizados++;
        else creados++;
        for (const [loc, cantidad] of [[tienda!, f.tienda], [linea!, f.enLinea]] as const) {
          await tx.stock.upsert({ where: { productoId_ubicacionId: { productoId: p.id, ubicacionId: loc.id } }, create: { productoId: p.id, ubicacionId: loc.id, cantidad }, update: { cantidad } });
        }
      }
      await tx.activityLog.create({ data: { usuarioId: actor.id, accion: "importar_productos", entidad: "Product", entidadId: "csv", detalle: { creados, actualizados, omitidas: r.filas.length - validas.length, por: actor.nombre } } });
      return { creados, actualizados, categoriasNuevas };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { ...resultado, omitidas: r.filas.length - validas.length };
}
