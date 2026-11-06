"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Globo de ayuda breve. Aparece al pasar el cursor o al enfocar con el teclado y se cierra con Escape.
 * El nombre accesible de lo que envuelve va aparte (aria-label); este texto solo se ve.
 * Va en posición fija (calculada al abrirse) para que ninguna tabla o panel con scroll lo recorte ni le abra una barra.
 */
export function Tooltip({ texto, children, className, lado = "abajo" }: { texto: string; children: React.ReactNode; className?: string; /** Dónde aparece; «arriba» para botones pegados al borde inferior. */ lado?: "abajo" | "arriba" }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [cerrado, setCerrado] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);

  const abrir = () => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: r.left + r.width / 2, y: lado === "abajo" ? r.bottom + 4 : r.top - 4 });
  };
  const cerrar = () => {
    setPos(null);
    setCerrado(false);
  };

  return (
    <span
      ref={caja}
      className={cn("relative inline-flex", className)}
      onMouseEnter={abrir}
      onFocus={abrir}
      onMouseLeave={cerrar}
      onBlur={cerrar}
      onKeyDown={(e) => e.key === "Escape" && setCerrado(true)}
    >
      {children}
      {pos && !cerrado && (
        <span
          role="tooltip"
          aria-hidden
          style={{ left: pos.x, top: pos.y }}
          className={cn("meta pointer-events-none fixed z-30 -translate-x-1/2 rounded-campo bg-carbon px-2 py-1 whitespace-nowrap text-sobre-carbon shadow-menu", lado === "arriba" && "-translate-y-full")}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
