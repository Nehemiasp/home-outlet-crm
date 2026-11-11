"use client";

import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/estructura";
import { Boton, CampoArchivo, CampoTexto, Selector } from "@/components/ui/form";

const PROPIA = "__propia";
export type DatosEnvioForm = { guia: string; archivo: File | null };

/**
 * «Pendiente de envío» (detalle del pedido y Despacho): el pedido ya está empacado y se elige, obligatoriamente, por dónde sale:
 * una paquetería de la lista de Ajustes o entrega propia. `onConfirmar` recibe la paquetería, o "" para entrega propia.
 * No avisa al cliente: el aviso sale al marcarlo como enviado, con la guía.
 */
export function ModalPendienteEnvio({
  abierto, codigo, paqueterias, actual, trabajando, error, onCerrar, onConfirmar,
}: {
  abierto: boolean;
  codigo: string;
  paqueterias: string[];
  /** La paquetería que ya tenía anotada el pedido, si es de la lista. */
  actual?: string | null;
  trabajando?: boolean;
  error?: string;
  onCerrar: () => void;
  onConfirmar: (paqueteria: string) => void;
}) {
  const [comoSale, setComoSale] = useState("");
  const [falta, setFalta] = useState("");
  useEffect(() => {
    if (!abierto) return;
    setComoSale(actual && paqueterias.includes(actual) ? actual : "");
    setFalta("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comoSale) return setFalta("Elija por dónde sale el pedido.");
    setFalta("");
    onConfirmar(comoSale === PROPIA ? "" : comoSale);
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Pendiente de envío">
      <form className="flex flex-col gap-4" onSubmit={confirmar}>
        <p className="cuerpo">
          El pedido <strong>{codigo}</strong> ya está empacado y pasará a «pendiente de envío». Elija por dónde sale: aparecerá en las etiquetas de envío, y al marcarlo como enviado solo se pedirá la guía.
        </p>
        <Selector
          etiqueta="¿Por dónde sale?"
          placeholder="Elegir…"
          value={comoSale}
          onCambio={setComoSale}
          error={falta && !comoSale ? falta : undefined}
          opciones={[...paqueterias.map((p) => ({ valor: p, texto: p })), { valor: PROPIA, texto: "Entrega propia (sin paquetería)" }]}
        />
        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={trabajando}>
            Pasar a pendiente de envío
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

/**
 * «Marcar como enviado» (detalle del pedido y Despacho). Por dónde sale ya se eligió en «pendiente de envío»: por paquetería pide
 * el número de guía y la guía adjunta (foto o PDF); con entrega propia solo se confirma. El servidor lo vuelve a validar.
 */
export function ModalEnviado({
  abierto, codigo, paqueteria, guiaActual, archivoActual, trabajando, error, onCerrar, onConfirmar,
}: {
  abierto: boolean;
  codigo: string;
  /** Por dónde sale (elegido en «pendiente de envío»); null = entrega propia. */
  paqueteria: string | null;
  /** La guía que ya tenía anotada el pedido, si la hay. */
  guiaActual?: string | null;
  /** El nombre de la guía ya adjunta, si la hay: así no hace falta volver a subirla. */
  archivoActual?: string | null;
  trabajando?: boolean;
  error?: string;
  onCerrar: () => void;
  onConfirmar: (d: DatosEnvioForm) => void;
}) {
  const [guia, setGuia] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [falta, setFalta] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setGuia(guiaActual ?? "");
    setArchivo(null);
    setFalta("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const porPaqueteria = !!paqueteria;
  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (porPaqueteria && !archivo && !archivoActual) return setFalta("Adjunte la guía de la paquetería (foto o PDF).");
    setFalta("");
    onConfirmar({ guia: porPaqueteria ? guia : "", archivo: porPaqueteria ? archivo : null });
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Marcar como enviado">
      <form className="flex flex-col gap-4" onSubmit={confirmar}>
        <p className="cuerpo">
          El pedido <strong>{codigo}</strong> {porPaqueteria ? <>sale por <strong>{paqueteria}</strong> y </> : <>sale con <strong>entrega propia</strong> y </>}
          pasará a «enviado». <strong>Se le avisará al cliente por el chat</strong>
          {porPaqueteria ? ", con el número de guía y la guía adjunta." : "."}
        </p>
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
