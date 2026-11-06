"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const subsecciones = [
  ["/ajustes/asistente", "General"],
  ["/ajustes/asistente/preguntas", "Preguntas frecuentes"],
  ["/ajustes/asistente/probar", "Probar"],
] as const;

export function Subsecciones() {
  const ruta = usePathname();
  return (
    <nav aria-label="Asistente" className="flex gap-2 overflow-x-auto">
      {subsecciones.map(([href, texto]) => (
        <Link
          key={href}
          href={href}
          aria-current={ruta === href ? "page" : undefined}
          className={cn("cuerpo-fuerte inline-flex h-10 items-center rounded-campo px-4 whitespace-nowrap max-md:min-h-11", ruta === href ? "bg-carbon text-sobre-carbon" : "border border-linea bg-superficie text-texto hover:bg-fondo")}
        >
          {texto}
        </Link>
      ))}
    </nav>
  );
}
