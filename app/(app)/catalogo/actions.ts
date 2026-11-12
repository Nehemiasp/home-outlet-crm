"use server";

import { z } from "zod";
import { MAX_BYTES, almacenamiento, extensionDeImagen } from "@/lib/almacenamiento";
import * as catalogo from "@/lib/catalogo";
import type { CategoriaDTO, DatosProducto, FilaProducto, FilaVistaPrevia, FiltrosCatalogo, ProductoDetalle, Ubicacion } from "@/lib/catalogo-tipos";
import { puedeGestionarProductos } from "@/lib/permisos";
import { requireConBodega, requireUsuario } from "@/lib/session";

type Resultado = { ok: true } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
const SOLO_ADMIN = "Solo un administrador, un jefe de tienda o alguien de oficina puede hacer esto.";
const id = z.string().min(1).max(40);
const MAX_CSV = 1024 * 1024;

/** Para acciones de administración: devuelve el usuario o null. */
async function admin() {
  const u = await requireUsuario();
  return puedeGestionarProductos(u) ? u : null;
}

/* ── Lectura (agentes y admin) ── */
const filtros = z.object({
  q: z.string().max(100),
  categoriaId: z.string().max(40),
  estado: z.enum(["todos", "activos", "inactivos"]),
  pagina: z.number().int().min(1).max(10_000),
});

export async function listar(f: FiltrosCatalogo): Promise<{ filas: FilaProducto[]; total: number; paginas: number; ubicaciones: Ubicacion[] }> {
  await requireConBodega(); // bodega también mira el catálogo
  return catalogo.listarProductos(filtros.parse(f));
}

export async function obtener(productoId: string): Promise<ProductoDetalle | null> {
  if (!(await admin())) return null;
  return catalogo.cargarProducto(id.parse(productoId));
}

export async function opciones(): Promise<{ ubicaciones: Ubicacion[]; categorias: CategoriaDTO[] }> {
  await requireConBodega();
  return { ubicaciones: await catalogo.ubicaciones(), categorias: await catalogo.categorias() };
}

/* ── Ajuste rápido de existencias (agentes y admin) ── */
export async function ajustarExistencias(productoId: string, cantidades: Record<string, number>): Promise<Resultado> {
  const u = await requireUsuario();
  const p = z.record(z.string().max(40), z.number().int("Las existencias deben ser números enteros.").min(0, "Las existencias no pueden ser negativas.").max(999_999)).safeParse(cantidades);
  if (!p.success) return fallo(p.error.issues[0]!.message);
  return catalogo.ajustarExistencias(id.parse(productoId), p.data, u);
}

/* ── Crear, editar, borrar, fotos (solo admin) ── */
const datos = z.object({
  sku: z.string().max(60),
  nombre: z.string().max(200),
  descripcion: z.string().max(5000),
  categoriaId: z.string().max(40),
  precio: z.string().max(30),
  activo: z.boolean(),
  imagenes: z.array(z.string().max(300)).max(10),
  existencias: z.record(z.string().max(40), z.number()),
});

export async function guardarProducto(productoId: string | null, d: DatosProducto): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const u = await admin();
  if (!u) return fallo(SOLO_ADMIN);
  const p = datos.safeParse(d);
  if (!p.success) return fallo("Revise los datos del producto.");
  // Solo se aceptan fotos subidas por este sistema o los marcadores de posición de /placeholder.
  if (!p.data.imagenes.every((url) => /^\/api\/archivos\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(url) || url.startsWith("/placeholder/"))) return fallo("Una de las fotos no es válida. Quítela y súbala otra vez.");
  return catalogo.guardarProducto(productoId ? id.parse(productoId) : null, p.data, u);
}

export async function borrarProducto(productoId: string): Promise<Resultado> {
  const u = await admin();
  if (!u) return fallo(SOLO_ADMIN);
  return catalogo.borrarProducto(id.parse(productoId), u);
}

export async function subirFoto(formulario: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await admin())) return fallo(SOLO_ADMIN);
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("Elija una imagen.");
  if (archivo.size > MAX_BYTES) return fallo("La imagen pesa más de 5 MB. Elija una más liviana.");
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = extensionDeImagen(buffer);
  if (!ext) return fallo("Solo se aceptan imágenes JPG, PNG o WebP.");
  return { ok: true, ...(await almacenamiento.guardar(buffer, ext)) };
}

/** Una foto de la carpeta: se asigna sola al producto cuyo SKU va al inicio del nombre del archivo (se suben de una en una). */
export async function subirFotoPorSku(formulario: FormData): Promise<catalogo.FotoPorSku> {
  const u = await admin();
  if (!u) return fallo(SOLO_ADMIN);
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("El archivo está vacío.");
  if (archivo.size > MAX_BYTES) return fallo("Pesa más de 5 MB. Elija una foto más liviana.");
  return catalogo.asignarFotoPorSku(archivo.name.slice(0, 200), Buffer.from(await archivo.arrayBuffer()), u);
}

/* ── Importar CSV (solo admin) ── */
const csv = z.string().max(MAX_CSV, "El archivo pesa más de 1 MB.");

export async function previsualizarCsv(texto: string): Promise<{ error?: string; filas: FilaVistaPrevia[] }> {
  if (!(await admin())) return { error: SOLO_ADMIN, filas: [] };
  const p = csv.safeParse(texto);
  if (!p.success) return { error: p.error.issues[0]!.message, filas: [] };
  return catalogo.previsualizarProductos(p.data);
}

export async function importarCsv(texto: string): Promise<{ error?: string; creados: number; actualizados: number; omitidas: number; categoriasNuevas: number }> {
  const u = await admin();
  const vacio = { creados: 0, actualizados: 0, omitidas: 0, categoriasNuevas: 0 };
  if (!u) return { error: SOLO_ADMIN, ...vacio };
  const p = csv.safeParse(texto);
  if (!p.success) return { error: p.error.issues[0]!.message, ...vacio };
  return catalogo.importarProductos(p.data, u);
}
