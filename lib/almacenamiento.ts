import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Dónde se guardan las imágenes. En desarrollo, disco local; en producción se cambia por un servicio de archivos sin tocar las pantallas. */
export interface StorageProvider {
  guardar(datos: Buffer, ext: string): Promise<{ url: string }>;
  leer(nombre: string): Promise<Buffer | null>;
}

// UPLOADS_DIR permite apuntar a un disco persistente (en producción, el volumen del servidor); por defecto, ./uploads.
const CARPETA = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(process.cwd(), "uploads");

export const almacenamientoLocal: StorageProvider = {
  async guardar(datos, ext) {
    await mkdir(CARPETA, { recursive: true });
    const nombre = `${randomUUID()}.${ext}`;
    await writeFile(path.join(CARPETA, nombre), datos);
    return { url: `/api/archivos/${nombre}` };
  },
  async leer(nombre) {
    // El nombre lo genera guardar(); cualquier otra forma se rechaza para que nadie salga de la carpeta.
    if (!NOMBRE_VALIDO.test(nombre)) return null;
    return readFile(path.join(CARPETA, nombre)).catch(() => null);
  },
};

export const NOMBRE_VALIDO = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const TIPOS: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const MAX_BYTES = 5 * 1024 * 1024;

/** Reconoce la imagen por su contenido, no por el nombre que trae el archivo. */
export function extensionDeImagen(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export const almacenamiento: StorageProvider = almacenamientoLocal;

/** Valida y guarda una imagen que llegó en un formulario (JPG, PNG o WebP de hasta 5 MB). */
export async function guardarImagenSubida(archivo: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elija una imagen." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "La imagen pesa más de 5 MB. Elija una más liviana." };
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ext = extensionDeImagen(buffer);
  if (!ext) return { ok: false, error: "Solo se aceptan imágenes JPG, PNG o WebP." };
  return { ok: true, url: (await almacenamiento.guardar(buffer, ext)).url };
}
