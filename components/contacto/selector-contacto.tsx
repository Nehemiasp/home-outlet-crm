"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { buscarContactos } from "@/app/(app)/contactos/actions";
import { Avatar } from "@/components/ui/etiquetas";
import { Buscador } from "@/components/ui/form";
import type { ContactoMini } from "@/lib/contactos-tipos";
import { formatTelefono } from "@/lib/utils";

/** Elegir un contacto buscándolo por nombre, teléfono o correo. */
export function SelectorContacto({ etiqueta, valor, onCambio, excluirId }: { etiqueta: string; valor: ContactoMini | null; onCambio: (c: ContactoMini | null) => void; excluirId?: string }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ContactoMini[]>([]);

  useEffect(() => {
    if (valor) return;
    let vigente = true;
    const t = setTimeout(() => void buscarContactos(q, excluirId).then((r) => vigente && setResultados(r)), 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q, valor, excluirId]);

  return (
    <div className="flex flex-col gap-1">
      <p className="cuerpo-fuerte">{etiqueta}</p>
      {valor ? (
        <div className="flex items-center gap-3 rounded-campo border border-texto-suave p-2">
          <Avatar nombre={valor.nombre} tamano="sm" />
          <div className="min-w-0 flex-1">
            <p className="cuerpo-fuerte truncate">{valor.nombre}</p>
            <p className="meta text-texto-suave">{valor.telefono ? formatTelefono(valor.telefono) : "Sin teléfono"}</p>
          </div>
          <button type="button" aria-label={`Quitar ${valor.nombre}`} onClick={() => onCambio(null)} className="grid size-10 cursor-pointer place-items-center rounded-campo text-texto-suave hover:bg-fondo hover:text-texto">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <Buscador valor={q} onCambio={setQ} etiqueta={etiqueta} placeholder="Nombre, teléfono o correo" />
          <ul className="max-h-48 overflow-y-auto rounded-campo border border-linea">
            {resultados.length === 0 && <li className="cuerpo p-3 text-texto-suave">No hay contactos con esa búsqueda.</li>}
            {resultados.map((c) => (
              <li key={c.id} className="border-b border-linea last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    onCambio(c);
                    setQ("");
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 p-2 text-left hover:bg-fondo max-md:min-h-11"
                >
                  <Avatar nombre={c.nombre} tamano="sm" />
                  <span className="cuerpo-fuerte min-w-0 flex-1 truncate">{c.nombre}</span>
                  <span className="meta text-texto-suave">{c.telefono ? formatTelefono(c.telefono) : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
