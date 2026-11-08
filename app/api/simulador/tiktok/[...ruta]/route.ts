import { apiSimulada } from "@/lib/canales/tiktok-simulado";

// La API de TikTok simulada (solo desarrollo; en producción responde 404). Ver lib/canales/tiktok-simulado.ts.
export async function POST(req: Request, { params }: { params: Promise<{ ruta: string[] }> }) {
  return apiSimulada((await params).ruta.join("/"), req);
}
