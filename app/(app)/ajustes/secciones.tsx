"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const secciones = [
  ["usuarios", "Usuarios"],
  ["equipo", "Equipo"],
  ["respuestas", "Respuestas rápidas"],
  ["etiquetas", "Etiquetas"],
  ["asistente", "Asistente"],
  ["canales", "Canales"],
  ["negocio", "Datos del negocio"],
  ["pagos-envios", "Pagos y envíos"],
];

export function Secciones() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de ajustes" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea">
      {secciones.map(([id, texto]) => {
        const activa = ruta === `/ajustes/${id}` || ruta.startsWith(`/ajustes/${id}/`);
        return (
          <Link
            key={id}
            href={`/ajustes/${id}`}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "cuerpo-fuerte -mb-px inline-flex h-10 items-center border-b-2 px-3 whitespace-nowrap transition-colors max-md:min-h-11",
              activa ? "border-naranja text-texto" : "border-transparent text-texto-suave hover:text-texto",
            )}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
