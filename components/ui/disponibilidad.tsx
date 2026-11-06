"use client";

import { CircleCheck, CirclePause, WifiOff } from "lucide-react";
import { Boton } from "./form";
import { Insignia } from "./etiquetas";
import { MenuDesplegable, Modal } from "./estructura";
import { MOTIVOS_PAUSA, type EstadoAsesorVista } from "@/lib/equipo/tipos";

/** Cuántos minutos lleva algo, sin bajar de cero. */
export const minutosDesde = (desdeMs: number, ahoraMs: number) => Math.max(0, Math.floor((ahoraMs - desdeMs) / 60_000));

/** Insignia del estado de un asesor: «Disponible», «En pausa · 12 min» o «Desconectado». */
export function InsigniaDisponibilidad({ estado, minutos, motivo }: { estado: EstadoAsesorVista; minutos?: number; motivo?: string | null }) {
  if (estado === "disponible") return <Insignia estado="exito" icono={CircleCheck}>Disponible</Insignia>;
  if (estado === "en_pausa") {
    return (
      <Insignia estado="aviso" icono={CirclePause}>
        En pausa{minutos !== undefined ? ` · ${minutos} min` : ""}
        {motivo ? ` · ${motivo}` : ""}
      </Insignia>
    );
  }
  return <Insignia estado="neutro" icono={WifiOff}>Desconectado</Insignia>;
}

/**
 * Control de la barra superior de un asesor. Disponible: «Pausar» con motivo opcional.
 * En pausa: el tiempo transcurrido y «Activarme».
 */
export function ControlDisponibilidad({
  estado, minutos, motivo, ocupado, onPausar, onActivar,
}: {
  estado: EstadoAsesorVista;
  minutos: number;
  motivo: string | null;
  ocupado?: boolean;
  onPausar: (motivo: string | null) => void;
  onActivar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <InsigniaDisponibilidad estado={estado} minutos={minutos} motivo={motivo} />
      {estado === "disponible" && (
        <MenuDesplegable
          etiqueta="Pausar"
          opciones={[
            ...MOTIVOS_PAUSA.map((m) => ({ texto: m, onElegir: () => onPausar(m) })),
            { texto: "Sin motivo", onElegir: () => onPausar(null) },
          ]}
        />
      )}
      {estado !== "disponible" && (
        <Boton variante="secundario" cargando={ocupado} onClick={onActivar}>
          Activarme
        </Boton>
      )}
    </div>
  );
}

/** Aviso a quien lleva rato en pausa: cada 15 minutos pregunta si quiere volver a recibir conversaciones. */
export function ModalPausaLarga({ abierto, minutos, ocupado, onActivar, onSeguir }: { abierto: boolean; minutos: number; ocupado?: boolean; onActivar: () => void; onSeguir: () => void }) {
  return (
    <Modal abierto={abierto} onCerrar={onSeguir} titulo="Sigue en pausa">
      <p className="cuerpo mb-4">Lleva {minutos} minutos en pausa. ¿Desea volver a recibir conversaciones?</p>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onSeguir}>
          Seguir en pausa
        </Boton>
        <Boton cargando={ocupado} onClick={onActivar}>
          Activarme
        </Boton>
      </div>
    </Modal>
  );
}
