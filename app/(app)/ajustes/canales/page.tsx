import type { Metadata } from "next";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Insignia, InsigniaCanal } from "@/components/ui/etiquetas";
import { estadoCanales, whatsappPorYCloud } from "@/lib/canales";
import type { Channel } from "@/lib/canales/tipos";

export const metadata: Metadata = { title: "Canales · Ajustes · Home Outlet" };

const NOTAS: Record<Channel, string> = {
  simulado: "Canal de pruebas: los mensajes salen de la pantalla Simulador. No se debe usar en producción.",
  whatsapp: "Necesita una cuenta de Meta Business verificada y un número de WhatsApp Business. Con eso, estos datos se escriben en el archivo de configuración del servidor (.env) y el canal se agrega a CHANNELS_ENABLED.",
  tiktok: "Necesita una cuenta de TikTok Business con el acceso a mensajes aprobado por TikTok. El cliente siempre escribe primero: se puede responder hasta 48 horas después de su último mensaje y hasta 10 mensajes seguidos sin que vuelva a escribir. Sin plantillas, video ni voz. Mientras tanto se puede probar con la API de TikTok simulada (solo desarrollo, ver .env.example).",
  instagram: "Se conecta en la fase 3.",
  facebook: "Se conecta en la fase 3.",
};

// Los canales que ya piden datos de conexión. Solo se muestran los nombres de las variables, nunca sus valores.
const VARIABLES: Partial<Record<Channel, string[]>> = {
  whatsapp: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
  tiktok: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_BUSINESS_ID", "TIKTOK_APP_SECRET"],
};

/** Con WHATSAPP_PROVEEDOR=ycloud, WhatsApp va por YCloud (coexistencia con la app del celular). */
const NOTA_YCLOUD =
  "Conectado por YCloud con coexistencia: el número sigue funcionando en la app de WhatsApp Business del celular y en WhatsApp Web, y lo que se escriba desde ahí también aparece aquí. Webhook en YCloud: https://<dominio>/api/webhooks/whatsapp.";
const VARIABLES_YCLOUD = ["YCLOUD_API_KEY", "YCLOUD_WEBHOOK_SECRET", "YCLOUD_NUMERO"];

export default function Canales() {
  const canales = estadoCanales();
  const porYCloud = whatsappPorYCloud();
  const nota = (c: Channel) => (c === "whatsapp" && porYCloud ? NOTA_YCLOUD : NOTAS[c]);
  const variables = (c: Channel) => (c === "whatsapp" && porYCloud ? VARIABLES_YCLOUD : VARIABLES[c]);
  return (
    <section aria-label="Canales" className="flex max-w-3xl flex-col gap-4">
      <p className="cuerpo text-texto-suave">Estado de cada canal por el que pueden escribir los clientes. Los canales se activan en la configuración del servidor, no desde esta pantalla.</p>
      <ul className="flex flex-col gap-3">
        {canales.map((c) => (
          <li key={c.canal} className="flex flex-col gap-2 rounded-tarjeta border border-linea bg-superficie p-4">
            <div className="flex flex-wrap items-center gap-3">
              <InsigniaCanal canal={c.canal} />
              <Insignia tono={c.activo ? "exito" : "aviso"} icono={c.activo ? CheckCircle2 : CircleDashed}>
                {c.activo ? "Activo" : "Pendiente de conexión"}
              </Insignia>
            </div>
            <p className="cuerpo text-texto-suave">{nota(c.canal)}</p>
            {variables(c.canal) && (
              <div>
                <p className="cuerpo-fuerte">Datos que hacen falta</p>
                <ul className="meta mt-1 flex flex-col gap-1">
                  {variables(c.canal)!.map((v) => {
                    const falta = c.faltantes.includes(v);
                    return (
                      <li key={v} className={falta ? "text-aviso" : "text-exito"}>
                        <code>{v}</code>: {falta ? "falta" : "configurada"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
