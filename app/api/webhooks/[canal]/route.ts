import { after } from "next/server";
import { CANALES, adaptador } from "@/lib/canales";
import type { Channel } from "@/lib/canales/tipos";
import { aplicarEstado } from "@/lib/estado-entrega";
import { procesarMensajeEntrante } from "@/lib/ia/atencion";
import { ipDelCliente } from "@/lib/ip";
import { minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";
import { recibirMensaje } from "@/lib/mensajeria";
import { registrarError } from "@/lib/registro";

// Webhook común. Nunca se registran tokens ni contenido de mensajes, solo el canal y el tipo de error.
// Las peticiones con firma inválida cuentan contra la IP (si hay una confiable, ver lib/ip.ts): pasadas 30 en 15 minutos se rechazan sin verificar.
const MAX_FIRMAS_MALAS = 30;

const canalDe = async (params: Promise<{ canal: string }>) => {
  const { canal } = await params;
  return (CANALES as readonly string[]).includes(canal) ? (canal as Channel) : null;
};

/** Verificación de la suscripción (WhatsApp, Facebook e Instagram mandan un GET con hub.challenge). */
export async function GET(req: Request, { params }: { params: Promise<{ canal: string }> }) {
  const canal = await canalDe(params);
  const reto = (canal && adaptador(canal)?.verifySubscription?.(new URL(req.url))) || null;
  return reto ? new Response(reto) : new Response(null, { status: 403 });
}

export async function POST(req: Request, { params }: { params: Promise<{ canal: string }> }) {
  const canal = await canalDe(params);
  const adp = canal && adaptador(canal);
  if (!canal || !adp) return new Response(null, { status: 404 });

  // El cuerpo solo se puede leer una vez: se guarda y se arman copias para cada paso.
  const crudo = await req.text();
  const copia = () => new Request(req.url, { method: "POST", headers: req.headers, body: crudo });

  const claveIp = ipDelCliente(req.headers) ? `webhook:${canal}:${ipDelCliente(req.headers)}` : null;
  if (claveIp && (await minutosBloqueado(claveIp, MAX_FIRMAS_MALAS)) > 0) return new Response(null, { status: 429 });
  if (!(await adp.verifyWebhook(copia()))) {
    if (claveIp) await registrarFallo(claveIp).catch(() => {});
    registrarError(`webhook ${canal}`, "firma inválida", { nivel: "aviso" });
    return new Response(null, { status: 401 });
  }

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
      registrarError(`webhook ${canal}`, e);
    }
  });
  return new Response(null, { status: 200 });
}
