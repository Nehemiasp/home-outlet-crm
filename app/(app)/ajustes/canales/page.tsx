import type { Metadata } from "next";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Insignia, InsigniaCanal } from "@/components/ui/etiquetas";
import { estadoCanales } from "@/lib/canales";
import type { Channel } from "@/lib/canales/tipos";

export const metadata: Metadata = { title: "Canales · Ajustes · Home Outlet" };

const NOTAS: Record<Channel, string> = {
  simulado: "Canal de pruebas: los mensajes salen de la pantalla Simulador. No se debe usar en producción.",
  whatsapp: "Necesita una cuenta de Meta Business verificada y un número de WhatsApp Business. Con eso, estos datos se escriben en el archivo de configuración del servidor (.env) y el canal se agrega a CHANNELS_ENABLED.",
  tiktok: "Se conecta en la fase 3.",
  instagram: "Se conecta en la fase 3.",
  facebook: "Se conecta en la fase 3.",
};

// Solo se muestran los nombres de las variables, nunca sus valores.
export default function Canales() {
  const canales = estadoCanales();
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
            <p className="cuerpo text-texto-suave">{NOTAS[c.canal]}</p>
            {c.canal === "whatsapp" && (
              <div>
                <p className="cuerpo-fuerte">Datos que hacen falta</p>
                <ul className="meta mt-1 flex flex-col gap-1">
                  {["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].map((v) => {
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
