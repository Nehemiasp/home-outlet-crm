"use client";

import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/estructura";
import { Boton, CampoArchivo, CampoTexto, Selector } from "@/components/ui/form";

const PROPIA = "__propia";
export type DatosEnvioForm = { /** Vacía = entrega propia. */ paqueteria: string; guia: string; archivo: File | null };

/**
 * «Marcar como enviado» (detalle del pedido y Despacho). Primero se elige cómo sale: entrega propia (sin guía ni archivo) o una
 * paquetería de la lista de Ajustes, que exige el número de guía y la guía adjunta (foto o PDF). El servidor lo vuelve a validar.
 */
export function ModalEnviado({
  abierto, codigo, paqueterias, guiaActual, archivoActual, trabajando, error, onCerrar, onConfirmar,
}: {
  abierto: boolean;
  codigo: string;
  paqueterias: string[];
  /** Lo que ya tenía el pedido (por ejemplo, la guía escrita mientras se preparaba). */
  guiaActual?: { paqueteria: string | null; guia: string | null };
  /** El nombre de la guía ya adjunta, si la hay: así no hace falta volver a subirla. */
  archivoActual?: string | null;
  trabajando?: boolean;
  error?: string;
  onCerrar: () => void;
  onConfirmar: (d: DatosEnvioForm) => void;
}) {
  const [comoSale, setComoSale] = useState("");
  const [guia, setGuia] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [falta, setFalta] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setComoSale(guiaActual?.paqueteria && paqueterias.includes(guiaActual.paqueteria) ? guiaActual.paqueteria : "");
    setGuia(guiaActual?.guia ?? "");
    setArchivo(null);
    setFalta("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const porPaqueteria = !!comoSale && comoSale !== PROPIA;
  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comoSale) return setFalta("Elija cómo sale el pedido.");
    if (porPaqueteria && !archivo && !archivoActual) return setFalta("Adjunte la guía de la paquetería (foto o PDF).");
    setFalta("");
    onConfirmar({ paqueteria: porPaqueteria ? comoSale : "", guia: porPaqueteria ? guia : "", archivo: porPaqueteria ? archivo : null });
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Marcar como enviado">
      <form className="flex flex-col gap-4" onSubmit={confirmar}>
        <p className="cuerpo">
          El pedido <strong>{codigo}</strong> pasará a «enviado» y <strong>se le avisará al cliente por el chat</strong>
          {porPaqueteria ? ", con el número de guía y la guía adjunta." : "."}
        </p>
        <Selector
          etiqueta="¿Cómo sale?"
          placeholder="Elegir…"
          value={comoSale}
          onCambio={setComoSale}
          opciones={[{ valor: PROPIA, texto: "Entrega propia" }, ...paqueterias.map((p) => ({ valor: p, texto: p }))]}
        />
        {porPaqueteria && (
          <>
            <CampoTexto etiqueta="Número de guía" required autoComplete="off" maxLength={60} value={guia} onChange={(e) => setGuia(e.target.value)} />
            <CampoArchivo
              etiqueta="Guía de la paquetería (foto o PDF)"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              formatos="JPG, PNG, WebP o PDF de hasta 5 MB"
              ayuda={archivoActual ? `Ya tiene una adjunta (${archivoActual}): elija otra solo para reemplazarla.` : undefined}
              archivo={archivo}
              onCambio={setArchivo}
            />
          </>
        )}
        {(falta || error) && (
          <p role="alert" className="meta text-error">
            {falta || error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={trabajando}>
            Marcar como enviado
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

/** La guía adjunta del pedido: abrirla (o descargarla) desde el detalle o Despacho. */
export function EnlaceGuia({ guia }: { guia: { url: string; nombre: string } }) {
  return (
    <a href={guia.url} target="_blank" rel="noopener" download={guia.nombre} className="cuerpo-fuerte inline-flex items-center gap-2 text-texto hover:underline max-md:min-h-11">
      <FileText className="size-4 shrink-0" aria-hidden />
      Guía adjunta: {guia.nombre}
    </a>
  );
}

/**
 * Cuando la guía no pudo salir por el chat (la ventana cerró, el canal no está conectado o no acepta PDF): el pedido quedó
 * enviado y la guía guardada; se descarga para mandarla a mano, como los textos que se copian.
 */
export function AvisoGuiaManual({ guia, onCerrar }: { guia: { url: string; nombre: string } | null; onCerrar: () => void }) {
  return (
    <Modal abierto={!!guia} onCerrar={onCerrar} titulo="Mande la guía a mano">
      <p className="cuerpo mb-4">El pedido quedó enviado y la guía guardada, pero el archivo no salió por el chat: el canal no lo permite ahora o no acepta PDF. Descárguelo y mándeselo al cliente por otro medio.</p>
      <div className="flex justify-end gap-2">
        {guia && (
          <a href={guia.url} download={guia.nombre} className="cuerpo-fuerte inline-flex h-10 items-center justify-center gap-2 rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
            <Download className="size-4" aria-hidden />
            Descargar guía
          </a>
        )}
        <Boton onClick={onCerrar}>Listo</Boton>
      </div>
    </Modal>
  );
}
