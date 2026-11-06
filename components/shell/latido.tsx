"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { latido } from "@/app/(app)/equipo/actions";
import type { Disponibilidad, RespuestaLatido } from "@/lib/equipo/tipos";
import { useActualizacion } from "@/lib/tiempo-real";

type Valor = {
  noLeidos: number;
  sinAsignar: number | null;
  disponibilidad: Disponibilidad | null;
  /** Milisegundos que el reloj del servidor va por delante del del navegador. */
  desfase: number;
  refrescar: () => void;
  poner: (d: Disponibilidad | null) => void;
};

const Contexto = createContext<Valor | null>(null);

/**
 * El latido de la aplicación: cada 10 s le avisa al servidor que la persona sigue ahí y trae los contadores
 * y su estado de disponibilidad. Lo comparten la barra lateral y la barra superior.
 */
export function ProveedorLatido({ inicial, children }: { inicial: { noLeidos: number; sinAsignar: number | null; disponibilidad: Disponibilidad | null }; children: React.ReactNode }) {
  const { datos, refrescar } = useActualizacion<RespuestaLatido>("latido", latido, 10_000);
  const [local, setLocal] = useState<{ d: Disponibilidad | null; hasta: number } | null>(null);
  const desfase = useRef(0);
  if (datos) desfase.current = datos.ahora - Date.now();

  // Un cambio hecho por la persona (pausar, activarse) se ve al instante, sin esperar al siguiente ciclo.
  const poner = (d: Disponibilidad | null) => {
    setLocal({ d, hasta: Date.now() + 12_000 });
    refrescar();
  };
  useEffect(() => {
    if (local && datos && Date.now() > local.hasta) setLocal(null);
  }, [datos, local]);

  const disponibilidad = local && Date.now() <= local.hasta ? local.d : datos ? datos.disponibilidad : inicial.disponibilidad;
  return <Contexto.Provider value={{ noLeidos: datos?.noLeidos ?? inicial.noLeidos, sinAsignar: datos ? datos.sinAsignar : inicial.sinAsignar, disponibilidad, desfase: desfase.current, refrescar, poner }}>{children}</Contexto.Provider>;
}

export function useLatido() {
  const v = useContext(Contexto);
  if (!v) throw new Error("useLatido va dentro de ProveedorLatido");
  return v;
}
