import { timingSafeEqual } from "node:crypto";
import { desconectarInactivos } from "@/lib/equipo/estado";

/** Para un cron externo (cada minuto): POST con el encabezado `Authorization: Bearer <TAREAS_SECRET>`. */
export async function POST(req: Request) {
  const secreto = process.env.TAREAS_SECRET;
  if (!secreto) return new Response(null, { status: 404 }); // sin secreto configurado, la ruta no existe
  const dado = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const esperado = Buffer.from(secreto);
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return new Response(null, { status: 401 });
  return Response.json({ desconectados: await desconectarInactivos({ forzar: true }) });
}
