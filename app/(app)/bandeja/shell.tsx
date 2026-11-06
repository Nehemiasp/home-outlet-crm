"use client";

import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ListaConversaciones } from "./lista";

/**
 * Escritorio (≥1024 px): la lista a la izquierda y la conversación a la derecha.
 * Teléfono y tableta: son pantallas separadas, la lista o la conversación.
 */
export function BandejaShell({ children, soloMias, veTodo }: { children: React.ReactNode; soloMias: boolean; veTodo: boolean }) {
  const { id } = useParams<{ id?: string }>();
  return (
    <div className="flex h-[calc(100dvh-3.5rem-var(--alto-barra,0rem))] md:h-[calc(100dvh-var(--alto-barra,0rem))]">
      <section aria-label="Conversaciones" className={cn("w-full flex-col border-r border-linea bg-superficie lg:flex lg:w-90 lg:shrink-0", id ? "hidden" : "flex")}>
        <ListaConversaciones idActivo={id} soloMias={soloMias} veTodo={veTodo} />
      </section>
      <div className={cn("min-w-0 flex-1", id ? "flex" : "hidden lg:flex")}>{children}</div>
    </div>
  );
}
