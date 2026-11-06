"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { crearContacto } from "@/app/(app)/contactos/actions";
import { AreaTexto, Boton, CampoTexto } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";

const VACIO = { nombre: "", telefono: "", correo: "", notas: "" };

/** Crear un contacto a mano. Si más tarde escribe por WhatsApp con ese teléfono, se junta solo con esta ficha. */
export function ModalCrear({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const avisar = useToast();
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setForm(VACIO);
      setError("");
    }
  }, [abierto]);

  const campo = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }) });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await crearContacto(form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Contacto creado");
    onCerrar();
    router.push(`/contactos/${r.id}`);
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Crear contacto">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <CampoTexto etiqueta="Nombre" autoComplete="off" autoFocus {...campo("nombre")} />
        <CampoTexto etiqueta="Teléfono" type="tel" autoComplete="off" ayuda="8 dígitos de Guatemala, por ejemplo 5555 1234." {...campo("telefono")} />
        <CampoTexto etiqueta="Correo" type="email" autoComplete="off" {...campo("correo")} />
        <AreaTexto etiqueta="Notas del cliente" maxLength={2000} {...campo("notas")} />
        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardando}>
            Crear contacto
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
