"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Actualización periódica de datos (4 s en la conversación abierta, 10 s en la lista).
 * Todas las pantallas pasan por aquí: para cambiar a SSE o a un servicio de tiempo real
 * solo se reescribe este hook. `clave` reinicia la consulta cuando cambia lo que se mira.
 */
export function useActualizacion<T>(clave: string, cargar: () => Promise<T>, cadaMs: number) {
  const [datos, setDatos] = useState<T>();
  const [fallo, setFallo] = useState(false);
  const cargarRef = useRef(cargar);
  const refrescarRef = useRef<() => void>(() => {});

  useEffect(() => {
    cargarRef.current = cargar;
  });

  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const nuevos = await cargarRef.current();
        if (vivo) {
          setDatos(nuevos);
          setFallo(false);
        }
      } catch {
        if (vivo) setFallo(true); // se reintenta en el siguiente ciclo
      }
    };
    refrescarRef.current = () => void tick();
    void tick();
    const id = setInterval(tick, cadaMs);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [clave, cadaMs]);

  return { datos, fallo, refrescar: () => refrescarRef.current() };
}
