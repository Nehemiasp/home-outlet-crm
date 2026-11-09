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
  /** «document»: un PDF del sistema (por ahora, la guía de la paquetería). Solo lo mandan los canales con `enviaDocumentos`. */
  type: "text" | "image" | "product" | "template" | "document";
  /** El nombre con que el cliente recibe el documento. */
  filename?: string;
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
  /**
   * ¿Puede mandar documentos (PDF)? WhatsApp sí (su API los acepta; probado solo contra Meta simulado). En Facebook, Instagram y
   * TikTok no está verificado: ahí un PDF no se intenta y la persona lo manda a mano.
   */
  enviaDocumentos?: boolean;
  canSendFreeForm(conversation: { lastInboundAt: Date | null }): boolean; // ventana de respuesta
  /** Cuántos mensajes seguidos se pueden mandar sin que el cliente vuelva a escribir (TikTok: 10). Sin valor, no hay tope. */
  maxSalientes?: number;
  /** Cuántos mensajes de la plataforma ocupa este envío (un texto largo o una tarjeta de producto salen en varios). Sin esto, uno. */
  contarMensajes?(m: OutboundMessage): number;
  parseWebhook(req: Request): Promise<{ messages: InboundMessage[]; statuses: StatusUpdate[] }>;
  verifyWebhook(req: Request): Promise<boolean>;
  /** Respuesta al GET con que Meta comprueba la dirección del webhook: el `hub.challenge`, o null si el token no coincide. */
  verifySubscription?(url: URL): string | null;
  /** Plantillas aprobadas que se pueden enviar fuera de la ventana de 24 horas. Solo los canales que las tienen. */
  listTemplates?(): Promise<PlantillaCanal[]>;
}

/** «Simulado» es solo para probar: en producción no aparece en los reportes ni como canal elegible. */
export const canalesDeReporte = (produccion = process.env.NODE_ENV === "production") => CANALES.filter((k) => !produccion || k !== "simulado");
