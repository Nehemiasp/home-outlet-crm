import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstadoVacio({ icono: Icono, titulo, descripcion, accion }: { icono: LucideIcon; titulo: string; descripcion?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-pildora bg-fondo text-texto-suave">
        <Icono className="size-6" aria-hidden />
      </span>
      <h3 className="titulo-panel">{titulo}</h3>
      {descripcion && <p className="cuerpo max-w-sm text-texto-suave">{descripcion}</p>}
      {accion}
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-campo bg-linea", className)} />;
}

/** Esqueleto de un item de la lista de conversaciones. */
export function EsqueletoConversacion() {
  return (
    <div role="status" aria-label="Cargando" className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-linea p-3">
      <Esqueleto className="size-10 rounded-pildora" />
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-4 w-1/2" />
        <Esqueleto className="h-4 w-5/6" />
      </div>
      <Esqueleto className="h-4 w-8" />
    </div>
  );
}
