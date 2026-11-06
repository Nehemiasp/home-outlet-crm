"use client";

import { FileText, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { armarCuerpo } from "@/lib/canales/plantillas-canal";
import type { PlantillaCanal } from "@/lib/canales/tipos";
import { cn } from "@/lib/utils";
import { EstadoVacio, Esqueleto } from "./estados";
import { Insignia } from "./etiquetas";
import { Modal } from "./estructura";
import { Boton, CampoTexto } from "./form";

const CATEGORIAS: Record<string, string> = { UTILITY: "Utilidad", MARKETING: "Promoción", SERVICE: "Servicio" };
const titulo = (nombre: string) => {
  const t = nombre.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Ventana para enviar una plantilla aprobada (lo único que se puede mandar con la ventana de 24 horas cerrada).
 * Se elige la plantilla, se llenan sus variables y se ve el mensaje tal como lo recibirá el cliente.
 * `plantillas` en undefined es «cargando»; `error` reemplaza la lista.
 */
export function ModalPlantillas({
  abierto,
  onCerrar,
  plantillas,
  error,
  enviando = false,
  onEnviar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  plantillas: PlantillaCanal[] | undefined;
  error?: string;
  enviando?: boolean;
  onEnviar: (plantilla: PlantillaCanal, parametros: string[]) => void;
}) {
  const [elegida, setElegida] = useState<PlantillaCanal | null>(null);
  const [valores, setValores] = useState<string[]>([]);

  useEffect(() => {
    if (!abierto) {
      setElegida(null);
      setValores([]);
    }
  }, [abierto]);

  const elegir = (p: PlantillaCanal) => {
    setElegida(p);
    setValores(Array.from({ length: p.variables }, () => ""));
  };
  const completa = !!elegida && valores.length === elegida.variables && valores.every((v) => v.trim());

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Enviar plantilla">
      <p className="cuerpo mb-3 text-texto-suave">Pasaron más de 24 horas desde el último mensaje del cliente. Solo se pueden enviar las plantillas aprobadas por WhatsApp.</p>

      {error ? (
        <EstadoVacio icono={WifiOff} titulo="No pudimos cargar las plantillas" descripcion={error} />
      ) : !plantillas ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
        </div>
      ) : plantillas.length === 0 ? (
        <EstadoVacio icono={FileText} titulo="No hay plantillas aprobadas" descripcion="Cree y apruebe una en WhatsApp Manager para poder escribirles a los clientes fuera de las 24 horas." />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Plantilla" className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {plantillas.map((p) => {
              const activa = elegida?.nombre === p.nombre && elegida.idioma === p.idioma;
              return (
                <button
                  key={`${p.nombre}-${p.idioma}`}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => elegir(p)}
                  className={cn("flex cursor-pointer flex-col gap-1 rounded-tarjeta border p-3 text-left max-md:min-h-11", activa ? "border-texto bg-naranja-suave" : "border-linea hover:bg-fondo")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="cuerpo-fuerte">{titulo(p.nombre)}</span>
                    <Insignia estado="neutro">{CATEGORIAS[p.categoria] ?? p.categoria}</Insignia>
                  </span>
                  <span className="meta line-clamp-2 text-texto-suave">{p.cuerpo}</span>
                </button>
              );
            })}
          </div>

          {elegida && (
            <>
              {elegida.variables > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {valores.map((v, i) => (
                    <CampoTexto
                      key={`${elegida.nombre}-${i}`}
                      etiqueta={`Variable ${i + 1}`}
                      value={v}
                      maxLength={200}
                      placeholder={i === 0 ? "Por ejemplo: el nombre del cliente" : undefined}
                      onChange={(e) => setValores((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  ))}
                </div>
              )}
              <div>
                <p className="meta mb-1 text-texto-suave">Así lo recibirá el cliente</p>
                <p className="cuerpo whitespace-pre-wrap rounded-tarjeta bg-fondo p-3">{armarCuerpo(elegida.cuerpo, valores)}</p>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton disabled={!completa} cargando={enviando} onClick={() => elegida && onEnviar(elegida, valores.map((v) => v.replace(/\s+/g, " ").trim()))}>
          Enviar plantilla
        </Boton>
      </div>
    </Modal>
  );
}
