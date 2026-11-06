"use client";

import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { cambiarEtiqueta, editarContacto } from "@/app/(app)/contactos/actions";
import { Avatar, InsigniaCanal, InsigniaEtiqueta, type Tono } from "@/components/ui/etiquetas";
import { AreaTexto, Boton, CampoTexto } from "@/components/ui/form";
import { MenuDesplegable } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { ContactoDetalle } from "@/lib/contactos-tipos";
import { formatTelefono } from "@/lib/utils";

type Contacto = Pick<ContactoDetalle, "id" | "nombre" | "telefono" | "correo" | "notas" | "etiquetas" | "identidades">;

const aFormulario = (k: Contacto) => ({ nombre: k.nombre, telefono: k.telefono ? formatTelefono(k.telefono) : "", correo: k.correo ?? "", notas: k.notas ?? "" });

/** Datos editables, canales y etiquetas de un contacto. Lo usan la ficha de la bandeja y la página de contactos. */
export function ContenidoContacto({ contacto: k, etiquetasDisponibles, onCambio }: { contacto: Contacto; etiquetasDisponibles: ContactoDetalle["etiquetasDisponibles"]; onCambio: () => void }) {
  const avisar = useToast();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(aFormulario(k));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await editarContacto(k.id, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    setEditando(false);
    avisar("Contacto actualizado");
    onCambio();
  };
  const etiqueta = async (id: string, poner: boolean) => {
    const r = await cambiarEtiqueta(k.id, id, poner);
    if (!r.ok) return avisar(r.error, "error");
    onCambio();
  };
  const campo = (clave: keyof typeof form) => ({ value: form[clave], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [clave]: e.target.value }) });

  return (
    <>
      <section aria-label="Datos">
        {editando ? (
          <form onSubmit={guardar} className="flex flex-col gap-3">
            <CampoTexto etiqueta="Nombre" autoComplete="off" {...campo("nombre")} />
            <CampoTexto etiqueta="Teléfono" type="tel" autoComplete="off" {...campo("telefono")} />
            <CampoTexto etiqueta="Correo" type="email" autoComplete="off" {...campo("correo")} />
            <AreaTexto etiqueta="Notas del cliente" maxLength={2000} {...campo("notas")} />
            {error && (
              <p role="alert" className="meta text-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
              <Boton variante="secundario" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar nombre={k.nombre} tamano="md" />
              <div className="min-w-0">
                <p className="titulo-panel truncate">{k.nombre}</p>
                <p className="cuerpo text-texto-suave">{k.telefono ? formatTelefono(k.telefono) : "Sin teléfono"}</p>
                {k.correo && <p className="cuerpo truncate text-texto-suave">{k.correo}</p>}
              </div>
            </div>
            <div>
              <p className="titulo-seccion mb-1 text-texto-suave">Notas del cliente</p>
              <p className="cuerpo whitespace-pre-wrap text-texto-suave">{k.notas || "Sin notas."}</p>
            </div>
            <Boton
              variante="secundario"
              tamano="sm"
              className="self-start"
              onClick={() => {
                setForm(aFormulario(k));
                setError("");
                setEditando(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Editar datos
            </Boton>
          </div>
        )}
      </section>

      <section aria-label="Canales">
        <h3 className="titulo-seccion mb-2 text-texto-suave">Canales donde ha escrito</h3>
        {k.identidades.length === 0 ? (
          <p className="cuerpo text-texto-suave">Todavía no ha escrito por ningún canal.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {k.identidades.map((i) => (
              <li key={i.canal + i.externalContactId} className="flex items-center gap-2">
                <InsigniaCanal canal={i.canal} />
                <span className="meta truncate text-texto-suave">{i.alias ?? (i.externalContactId.startsWith("+502") ? formatTelefono(i.externalContactId) : "")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Etiquetas">
        <h3 className="titulo-seccion mb-2 text-texto-suave">Etiquetas</h3>
        <div className="flex flex-wrap items-center gap-2">
          {k.etiquetas.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <InsigniaEtiqueta nombre={t.nombre} tono={t.color as Tono} />
              <button
                type="button"
                aria-label={`Quitar la etiqueta ${t.nombre}`}
                onClick={() => etiqueta(t.id, false)}
                className="grid size-6 cursor-pointer place-items-center rounded-pildora text-texto-suave hover:bg-linea hover:text-texto max-lg:size-8"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          {k.etiquetas.length === 0 && <span className="cuerpo text-texto-suave">Sin etiquetas.</span>}
        </div>
        {etiquetasDisponibles.length > 0 && (
          <div className="mt-2">
            <MenuDesplegable etiqueta="Agregar etiqueta" variante="fantasma" opciones={etiquetasDisponibles.map((t) => ({ texto: t.nombre, onElegir: () => etiqueta(t.id, true) }))} />
          </div>
        )}
      </section>
    </>
  );
}
