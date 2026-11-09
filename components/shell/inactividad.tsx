"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { salir } from "@/app/login/actions";
import { AvisoInactividad } from "@/components/ui/seguridad";
import { CLAVE_ACTIVIDAD, estadoInactividad } from "@/lib/inactividad";

// Lo que cuenta como que alguien usa el sistema. El latido y las actualizaciones periódicas no pasan por aquí.
const EVENTOS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

// La hora se comparte entre pestañas por localStorage; si el navegador no lo deja usar (modo privado estricto), cada pestaña cuenta la suya.
const leer = (): number | null => {
  try {
    const v = Number(window.localStorage.getItem(CLAVE_ACTIVIDAD));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const guardar = (t: number) => {
  try {
    window.localStorage.setItem(CLAVE_ACTIVIDAD, String(t));
  } catch {
    // sin localStorage vale la hora en memoria
  }
};

/** Cierra la sesión tras un rato sin usar el sistema, avisando un minuto antes. Va una vez en el marco de la aplicación. */
export function CierrePorInactividad() {
  const [segundos, setSegundos] = useState<number | null>(null); // mientras se avisa, los que faltan para el cierre
  const enMemoria = useRef(0);
  const cerrando = useRef(false);

  const marcar = (t = Date.now()) => {
    enMemoria.current = t;
    guardar(t);
  };

  useEffect(() => {
    let ultimaMarca = 0;
    // Mover el ratón dispara cientos de eventos: con anotar uno cada 5 s basta.
    const alUsar = () => {
      const ahora = Date.now();
      if (ahora - ultimaMarca < 5000) return;
      ultimaMarca = ahora;
      marcar(ahora);
    };
    alUsar(); // abrir el sistema cuenta como actividad
    for (const e of EVENTOS) window.addEventListener(e, alUsar, { passive: true, capture: true });

    // Cada segundo, y también al volver de una suspensión (el reloj sigue aunque el intervalo se haya detenido): si ya pasó el tiempo, se cierra sin aviso.
    const id = setInterval(() => {
      const estado = estadoInactividad(leer() ?? enMemoria.current, Date.now());
      if (estado.tipo === "cerrar" && !cerrando.current) {
        cerrando.current = true;
        startTransition(() => salir("inactividad"));
      }
      setSegundos(estado.tipo === "aviso" ? estado.segundos : null);
    }, 1000);

    return () => {
      clearInterval(id);
      for (const e of EVENTOS) window.removeEventListener(e, alUsar, { capture: true });
    };
  }, []);

  return (
    <AvisoInactividad
      abierto={segundos !== null}
      segundos={segundos ?? 0}
      onSeguir={() => {
        marcar();
        setSegundos(null);
      }}
      onSalir={() => startTransition(() => salir())}
    />
  );
}
