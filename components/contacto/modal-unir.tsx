"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { unirContactos } from "@/app/(app)/contactos/actions";
import { Boton } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { ContactoMini } from "@/lib/contactos-tipos";
import { SelectorContacto } from "./selector-contacto";

/** Unir dos contactos: el primero se conserva y recibe todo lo del segundo, que desaparece. Solo admin. */
export function ModalUnir({ abierto, onCerrar, conservarInicial, onUnido }: { abierto: boolean; onCerrar: () => void; conservarInicial?: ContactoMini; onUnido: () => void }) {
  const avisar = useToast();
  const [conservar, setConservar] = useState<ContactoMini | null>(conservarInicial ?? null);
  const [unir, setUnir] = useState<ContactoMini | null>(null);
  const [error, setError] = useState("");
  const [uniendo, setUniendo] = useState(false);

  useEffect(() => {
    if (abierto) {
      setConservar(conservarInicial ?? null);
      setUnir(null);
      setError("");
    }
  }, [abierto, conservarInicial]);

  const confirmar = async () => {
    if (!conservar || !unir) return;
    setUniendo(true);
    const r = await unirContactos(conservar.id, unir.id);
    setUniendo(false);
    if (!r.ok) return setError(r.error);
    avisar(`${unir.nombre} se unió a ${conservar.nombre}`);
    onCerrar();
    onUnido();
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Unir contactos">
      <div className="flex flex-col gap-4">
        <p className="cuerpo text-texto-suave">Use esto cuando un mismo cliente quedó registrado dos veces, por ejemplo por WhatsApp y por TikTok.</p>
        <SelectorContacto etiqueta="Contacto que se conserva" valor={conservar} onCambio={setConservar} excluirId={unir?.id} />
        <SelectorContacto etiqueta="Contacto que se une al anterior" valor={unir} onCambio={setUnir} excluirId={conservar?.id} />
        {conservar && unir && (
          <p className="cuerpo flex items-start gap-2 rounded-campo bg-aviso-suave p-3 text-aviso">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              Las conversaciones, canales y etiquetas de <strong>{unir.nombre}</strong> pasarán a <strong>{conservar.nombre}</strong>, y {unir.nombre} se eliminará. No se puede deshacer.
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" disabled={!conservar || !unir} cargando={uniendo} onClick={confirmar}>
            Unir contactos
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
