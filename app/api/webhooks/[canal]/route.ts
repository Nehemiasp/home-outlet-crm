import { after } from "next/server";
import { CANALES, adaptador } from "@/lib/canales";
import { verificarSuscripcion } from "@/lib/canales/whatsapp";
import type { Channel } from "@/lib/canales/tipos";
import { aplicarEstado } from "@/lib/estado-entrega";
import { procesarMensajeEntrante } from "@/lib/ia/atencion";
import { recibirMensaje } from "@/lib/mensajeria";

// Webhook común. Nunca se registran tokens ni contenido de mensajes, solo el canal y el tipo de error.

const canalDe = async (params: Promise<{ canal: string }>) => {
  const { canal } = await params;
  return (CANALES as readonly string[]).includes(canal) ? (canal as Channel) : null;
};

/** Verificación de la suscripción (WhatsApp manda un GET con hub.challenge). */
export async function GET(req: Request, { params }: { params: Promise<{ canal: string }> }) {
  const canal = await canalDe(params);
  const reto = canal === "whatsapp" && adaptador("whatsapp") ? verificarSuscripcion(new URL(req.url)) : null;
  return reto ? new Response(reto) : new Response(null, { status: 403 });
}

export async function POST(req: Request, { params }: { params: Promise<{ canal: string }> }) {
  const canal = await canalDe(params);
  const adp = canal && adaptador(canal);
  if (!canal || !adp) return new Response(null, { status: 404 });

  // El cuerpo solo se puede leer una vez: se guarda y se arman copias para cada paso.
  const crudo = await req.text();
  const copia = () => new Request(req.url, { method: "POST", headers: req.headers, body: crudo });

  if (!(await adp.verifyWebhook(copia()))) return new Response(null, { status: 401 });

  // Responder rápido y procesar después.
  after(async () => {
    try {
      const { messages, statuses } = await adp.parseWebhook(copia());
      for (const m of messages) {
        const r = await recibirMensaje(m);
        if (!r.duplicado && r.conversacionId) await procesarMensajeEntrante(r.conversacionId);
      }
      for (const s of statuses) await aplicarEstado(s);
    } catch (e) {
      console.error(`webhook ${canal}: ${e instanceof Error ? e.name : "error"}`);
    }
  });
  return new Response(null, { status: 200 });
}
