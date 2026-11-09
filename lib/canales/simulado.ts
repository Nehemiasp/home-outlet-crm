import { randomUUID } from "node:crypto";
import { z } from "zod";
import { aplicarEstado } from "@/lib/estado-entrega";
import { ventanaAbierta } from "./ventana";
import type { ChannelAdapter } from "./tipos";

const cuerpo = z.object({
  externalContactId: z.string().min(1),
  contactName: z.string().optional(),
  text: z.string().min(1).max(4000),
  externalMessageId: z.string().optional(),
});

// ponytail: los avisos "entregado" y "leído" salen de un setTimeout del mismo proceso.
// Basta para el canal simulado; los canales reales los reciben por webhook.
function programarEstados(externalMessageId: string) {
  for (const [status, ms] of [["entregado", 1000], ["leido", 2500]] as const) {
    setTimeout(() => void aplicarEstado({ externalMessageId, status, timestamp: new Date() }).catch(() => {}), ms).unref?.();
  }
}

// ponytail: para probar "No se envió / Reintentar" sin una red real. Escribir "/fallar" falla la primera vez y acierta al reintentar.
const yaFallo = new Set<string>();

export const adaptadorSimulado: ChannelAdapter = {
  channel: "simulado",
  enviaDocumentos: true, // para probar el envío de la guía en PDF sin un canal real

  async send(to, message) {
    if (process.env.NODE_ENV !== "production" && message.text?.trim() === "/fallar") {
      const clave = `${to}|${message.text}`;
      if (!yaFallo.delete(clave)) {
        yaFallo.add(clave);
        throw new Error("Fallo simulado");
      }
    }
    const externalMessageId = `sim-out-${randomUUID()}`;
    programarEstados(externalMessageId);
    return { externalMessageId };
  },

  // Dos plantillas de ejemplo, para probar la ventana de plantillas sin una cuenta de Meta.
  listTemplates: async () => [
    { nombre: "seguimiento_cotizacion", idioma: "es", categoria: "UTILITY", cuerpo: "Hola {{1}}, ¿pudo revisar la cotización que le enviamos? Con gusto le ayudamos con cualquier duda.", variables: 1 },
    { nombre: "pedido_listo", idioma: "es", categoria: "UTILITY", cuerpo: "Hola {{1}}, su pedido {{2}} ya está listo para recoger. Lo esperamos en Home Outlet.", variables: 2 },
  ],

  // Igual que WhatsApp: 24 horas desde el último mensaje del cliente.
  canSendFreeForm: (conversacion) => ventanaAbierta(conversacion.lastInboundAt),

  async parseWebhook(req) {
    const b = cuerpo.parse(await req.json());
    return {
      messages: [
        {
          channel: "simulado",
          externalContactId: b.externalContactId,
          contactName: b.contactName,
          externalMessageId: b.externalMessageId ?? `sim-in-${randomUUID()}`,
          type: "text",
          text: b.text,
          timestamp: new Date(),
        },
      ],
      statuses: [],
    };
  },

  // Sin firma que revisar: solo se acepta fuera de producción.
  verifyWebhook: async () => process.env.NODE_ENV !== "production",
};
