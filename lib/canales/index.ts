import { adaptadorSimulado } from "./simulado";
import { adaptadorFacebook, adaptadorInstagram, metaFaltantes } from "./meta-mensajeria";
import { adaptadorTikTok, tiktokFaltantes } from "./tiktok";
import { adaptadorWhatsApp, whatsappFaltantes } from "./whatsapp";
import { adaptadorYCloud, ycloudFaltantes } from "./ycloud";
import { CANALES, type Channel, type ChannelAdapter } from "./tipos";

export { CANALES };

/** WhatsApp se conecta directo con Meta (de fábrica) o por YCloud con WHATSAPP_PROVEEDOR=ycloud (para la coexistencia). */
export const whatsappPorYCloud = () => process.env.WHATSAPP_PROVEEDOR?.trim().toLowerCase() === "ycloud";

const adaptadores: Record<Channel, ChannelAdapter> = {
  simulado: adaptadorSimulado,
  whatsapp: adaptadorWhatsApp,
  tiktok: adaptadorTikTok,
  instagram: adaptadorInstagram,
  facebook: adaptadorFacebook,
};

/** Variables de entorno que faltan para conectar el canal (vacío = listo). */
const faltantes = (canal: Channel): string[] =>
  canal === "whatsapp" ? [...(whatsappPorYCloud() ? ycloudFaltantes() : whatsappFaltantes())] : canal === "facebook" || canal === "instagram" ? [...metaFaltantes(canal)] : canal === "tiktok" ? [...tiktokFaltantes()] : [];

/** CHANNELS_ENABLED=simulado,whatsapp */
export function canalesHabilitados(valor = process.env.CHANNELS_ENABLED ?? "") {
  return new Set(valor.split(",").map((c) => c.trim().toLowerCase()).filter((c): c is Channel => (CANALES as readonly string[]).includes(c)));
}

/** El adaptador del canal, o null si no está habilitado o le faltan credenciales. */
export function adaptador(canal: Channel): ChannelAdapter | null {
  if (!canalesHabilitados().has(canal)) return null;
  if (faltantes(canal).length) return null;
  return canal === "whatsapp" && whatsappPorYCloud() ? adaptadorYCloud : adaptadores[canal];
}

/** Para la pantalla de Ajustes: estado de cada canal y qué datos faltan. */
export function estadoCanales() {
  return CANALES.map((canal) => ({
    canal,
    activo: adaptador(canal) !== null,
    faltantes: faltantes(canal),
  }));
}
