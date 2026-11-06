"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type Aviso = { id: number; texto: string; tipo: "exito" | "error" };
const Contexto = createContext<(texto: string, tipo?: Aviso["tipo"]) => void>(() => {});

/** Uso: const avisar = useToast(); avisar("Conversación cerrada"); */
export const useToast = () => useContext(Contexto);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback(
    (texto: string, tipo: Aviso["tipo"] = "exito") => {
      const id = Date.now() + Math.random();
      setAvisos((a) => [...a, { id, texto, tipo }]);
      setTimeout(() => quitar(id), 5000);
    },
    [quitar],
  );

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2 max-md:bottom-20">
        {avisos.map((a) => (
          <div key={a.id} className={cn("cuerpo flex items-start gap-2 rounded-tarjeta bg-carbon p-3 text-sobre-carbon shadow-menu")}>
            {a.tipo === "exito" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-naranja" aria-hidden /> : <AlertCircle className="mt-0.5 size-5 shrink-0 text-sobre-carbon-suave" aria-hidden />}
            <p className="flex-1">
              {a.tipo === "error" && <span className="cuerpo-fuerte">Error: </span>}
              {a.texto}
            </p>
            <button type="button" aria-label="Cerrar aviso" onClick={() => quitar(a.id)} className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-campo hover:bg-carbon-soft">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
