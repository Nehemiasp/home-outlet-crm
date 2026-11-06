import { NOMBRE_VALIDO, TIPOS, almacenamiento } from "@/lib/almacenamiento";
import { getUsuario } from "@/lib/session";
import { puedeVerArchivo } from "@/lib/visibilidad";

export async function GET(_req: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const u = await getUsuario();
  if (!u) return new Response(null, { status: 401 });
  const { nombre } = await params;
  // Un asesor solo abre los archivos de sus conversaciones y pedidos (y las fotos del catálogo); lo demás es 404.
  const datos = NOMBRE_VALIDO.test(nombre) && (await puedeVerArchivo(u, nombre)) ? await almacenamiento.leer(nombre) : null;
  if (!datos) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(datos), {
    headers: { "content-type": TIPOS[nombre.split(".")[1]!]!, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
  });
}
