import { adaptadorSimulado } from "./simulado";
import { adaptadorWhatsApp, whatsappFaltantes } from "./whatsapp";
import { CANALES, type Channel, type ChannelAdapter } from "./tipos";

export { CANALES };

// TikTok, Instagram y Facebook llegan en la fase 3: agregar su archivo aquí.
const adaptadores: Record<Channel, ChannelAdapter | null> = {
  simulado: adaptadorSimulado,
  whatsapp: adaptadorWhatsApp,
  tiktok: null,
  instagram: null,
  facebook: null,
};

/** CHANNELS_ENABLED=simulado,whatsapp */
export function canalesHabilitados(valor = process.env.CHANNELS_ENABLED ?? "") {
  return new Set(valor.split(",").map((c) => c.trim().toLowerCase()).filter((c): c is Channel => (CANALES as readonly string[]).includes(c)));
}

/** El adaptador del canal, o null si no está habilitado o le faltan credenciales. */
export function adaptador(canal: Channel): ChannelAdapter | null {
  if (!canalesHabilitados().has(canal)) return null;
  if (canal === "whatsapp" && whatsappFaltantes().length) return null;
  return adaptadores[canal];
}

/** Para la pantalla de Ajustes: estado de cada canal y qué datos faltan. */
export function estadoCanales() {
  return CANALES.map((canal) => ({
    canal,
    activo: adaptador(canal) !== null,
    faltantes: canal === "whatsapp" ? whatsappFaltantes() : canal === "simulado" ? [] : ["Se conecta en la fase 3"],
  }));
}
