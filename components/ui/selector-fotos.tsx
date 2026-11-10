"use client";

import { cn } from "@/lib/utils";

/**
 * Elegir qué fotos de un producto se le mandan al cliente. Todas empiezan marcadas (quien la abre decide); salen en el orden del
 * catálogo y la primera marcada va con el nombre y el precio. Cada foto es una casilla de verdad: se marca con clic o con la barra
 * espaciadora, y el lector de pantalla dice cuál es.
 */
export function SelectorFotos({ fotos, elegidas, onCambio, nombre }: { fotos: string[]; elegidas: string[]; onCambio: (elegidas: string[]) => void; nombre: string }) {
  const marcadas = fotos.filter((f) => elegidas.includes(f)); // en el orden del catálogo
  const alternar = (f: string) => onCambio(elegidas.includes(f) ? marcadas.filter((x) => x !== f) : fotos.filter((x) => x === f || elegidas.includes(x)));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="cuerpo-fuerte">Fotos que se envían</legend>
      <p className="meta text-texto-suave">La primera marcada va con el nombre y el precio; las demás salen detrás, sin texto.</p>
      <ul className="grid grid-cols-3 gap-2">
        {fotos.map((f, i) => {
          const marcada = elegidas.includes(f);
          return (
            <li key={f}>
              <label className={cn("relative block aspect-square cursor-pointer overflow-hidden rounded-campo border-2 bg-fondo transition-colors duration-150", marcada ? "border-carbon" : "border-linea")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt="" className={cn("size-full object-contain p-1 transition-opacity duration-150", !marcada && "opacity-40")} />
                <input type="checkbox" checked={marcada} onChange={() => alternar(f)} aria-label={`Enviar la foto ${i + 1} de ${nombre}`} className="absolute left-1.5 top-1.5 size-5" />
                {marcadas[0] === f && <span className="meta absolute inset-x-1 bottom-1 truncate rounded-pildora bg-carbon px-2 text-center text-sobre-carbon">Con precio</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
