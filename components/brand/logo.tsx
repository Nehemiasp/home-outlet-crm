import Image from "next/image";
import { cn } from "@/lib/utils";

// Proporciones del logo recortado a su contenido (viewBox de los SVG de public/brand/).
const ANCHO = 1317;
const ALTO = 1650;

/**
 * El logo de Home Outlet Internacional (SVG trazado del logo del cliente, 10-nov-2026).
 * `sobreOscuro`: casa y «HOME» en blanco, para el fondo carbón; si no, en carbón para fondos claros.
 * El tamaño se da con la altura (`className`, por ejemplo `h-20`); el ancho sigue la proporción.
 */
export function Logo({ sobreOscuro = false, className, prioridad = false }: { sobreOscuro?: boolean; className?: string; prioridad?: boolean }) {
  return (
    <Image
      src={sobreOscuro ? "/brand/logo-home-outlet-oscuro.svg" : "/brand/logo-home-outlet-claro.svg"}
      alt="Home Outlet Internacional"
      width={ANCHO}
      height={ALTO}
      priority={prioridad}
      className={cn("h-16 w-auto", className)}
    />
  );
}
