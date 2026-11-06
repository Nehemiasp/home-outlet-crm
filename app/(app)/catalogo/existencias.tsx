"use client";

import { Package } from "lucide-react";
import { InsigniaExistencia } from "@/components/ui/etiquetas";
import type { Ubicacion } from "@/lib/catalogo-tipos";
import { cn } from "@/lib/utils";

/** Foto del producto; sin foto, un ícono de 20 px en texto suave sobre fondo (más ligero que una imagen de relleno). */
export function FotoProducto({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" loading="lazy" className={cn("bg-fondo object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("grid place-items-center bg-fondo text-texto-suave", className)}>
      <Package className="size-5" />
    </span>
  );
}

/** El nombre corto de una ubicación para el encabezado de columna: «Tienda física» → «Física». */
export const columnaDeUbicacion = (nombre: string) => {
  const corto = nombre.replace(/^tienda\s+/i, "");
  return corto.charAt(0).toUpperCase() + corto.slice(1);
};

/** Una celda de la tabla: el disponible con la insignia si queda poco o no hay, y lo apartado debajo. */
export function CeldaExistencia({ disponible, apartado }: { disponible: number; apartado: number }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="cuerpo-fuerte tabular-nums">{disponible}</span>
        {disponible <= 3 && <InsigniaExistencia cantidad={disponible} />}
      </span>
      {apartado > 0 && <span className="meta text-texto-suave">Apartado {apartado}</span>}
    </span>
  );
}

/** Disponible por ubicación (lo que hay menos lo apartado); avisa con una insignia cuando queda poco ("Quedan 2") o no hay ("Sin existencia"). */
export function Existencias({ ubicaciones, existencias, apartados = {} }: { ubicaciones: Ubicacion[]; existencias: Record<string, number>; apartados?: Record<string, number> }) {
  return (
    <ul className="flex flex-col gap-1">
      {ubicaciones.map((u) => {
        const apartado = apartados[u.id] ?? 0;
        const disponible = Math.max(0, (existencias[u.id] ?? 0) - apartado);
        return (
          <li key={u.id} className="flex items-center gap-2 whitespace-nowrap">
            <span className="meta text-texto-suave">{u.nombre}:</span>
            <span className="cuerpo-fuerte">{disponible}</span>
            {apartado > 0 && <span className="meta text-texto-suave">· Apartado {apartado}</span>}
            {disponible <= 3 && <InsigniaExistencia cantidad={disponible} />}
          </li>
        );
      })}
    </ul>
  );
}
