"use client";

import { Boton } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";

/** Cuando el aviso al cliente no pudo salir por el canal: el texto para copiarlo y mandarlo a mano. */
export function AvisoCopiar({ texto, onCerrar }: { texto: string | null; onCerrar: () => void }) {
  const avisar = useToast();
  return (
    <Modal abierto={texto !== null} onCerrar={onCerrar} titulo="Avise al cliente">
      <p className="cuerpo mb-3">No se pudo mandar el aviso por el canal. Copie el mensaje y envíeselo al cliente:</p>
      <textarea readOnly value={texto ?? ""} aria-label="Mensaje para el cliente" rows={6} className="cuerpo w-full resize-none rounded-campo border border-texto-suave p-3" onFocus={(e) => e.currentTarget.select()} />
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={() => void navigator.clipboard.writeText(texto ?? "").then(() => avisar("Mensaje copiado"), () => avisar("No se pudo copiar. Selecciónelo y cópielo a mano.", "error"))}>
          Copiar mensaje
        </Boton>
        <Boton onClick={onCerrar}>Listo</Boton>
      </div>
    </Modal>
  );
}
