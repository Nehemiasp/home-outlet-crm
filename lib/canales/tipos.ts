export const CANALES = ["whatsapp", "tiktok", "instagram", "facebook", "simulado"] as const;
export type Channel = (typeof CANALES)[number];

export interface InboundMessage {
  channel: Channel;
  externalContactId: string; // teléfono en WhatsApp, id del usuario en otras redes
  contactName?: string;
  externalMessageId: string; // para no duplicar mensajes
  type: "text" | "image" | "audio" | "video" | "document" | "location" | "unsupported";
  text?: string;
  mediaUrl?: string;
  timestamp: Date;
}

export interface OutboundMessage {
  type: "text" | "image" | "product" | "template";
  /** En una plantilla, el texto ya armado con sus variables: es lo que se guarda y se ve en la conversación. */
  text?: string;
  mediaUrl?: string;
  productId?: string;
  template?: { nombre: string; idioma: string; parametros: string[] };
}

/** Plantilla aprobada del canal, lista para elegir. `cuerpo` lleva {{1}}, {{2}}… donde van las variables. */
export interface PlantillaCanal {
  nombre: string;
  idioma: string;
  categoria: string;
  cuerpo: string;
  variables: number;
}

export interface StatusUpdate {
  externalMessageId: string;
  status: "enviado" | "entregado" | "leido" | "fallo";
  timestamp: Date;
}

export interface ChannelAdapter {
  channel: Channel;
  send(to: string, message: OutboundMessage): Promise<{ externalMessageId: string }>;
  canSendFreeForm(conversation: { lastInboundAt: Date | null }): boolean; // ventana de respuesta
  parseWebhook(req: Request): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[] }>;
  verifyWebhook(req: Request): Promise<boolean>;
  /** Plantillas aprobadas que se pueden enviar fuera de la ventana de 24 horas. Solo los canales que las tienen. */
  listTemplates?(): Promise<PlantillaCanal[]>;
}

/** «Simulado» es solo para probar: en producción no aparece en los reportes ni como canal elegible. */
export const canalesDeReporte = (produccion = process.env.NODE_ENV === "production") => CANALES.filter((k) => !produccion || k !== "simulado");
