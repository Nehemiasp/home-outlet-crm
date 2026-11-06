"use client";

import { useEffect, useRef, useState } from "react";
import { activarme, pausar } from "@/app/(app)/equipo/actions";
import { ControlDisponibilidad, minutosDesde, ModalPausaLarga } from "@/components/ui/disponibilidad";
import { useToast } from "@/components/ui/toast";
import { AVISO_PAUSA_MS } from "@/lib/equipo/tipos";
import { useLatido } from "./latido";

/** Dos pitidos cortos con Web Audio: no hace falta un archivo de sonido. */
function pitar() {
  try {
    const ctx = new AudioContext();
    [0, 0.3].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // sin audio disponible: queda la notificación
  }
}

/** Barra superior del asesor: su estado de disponibilidad, «Pausar» / «Activarme» y el aviso cuando lleva rato en pausa. */
export function BarraDisponibilidad() {
  const avisar = useToast();
  const { disponibilidad: d, desfase, poner } = useLatido();
  const [ahora, setAhora] = useState(() => Date.now());
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState(false);
  const [umbral, setUmbral] = useState(AVISO_PAUSA_MS);
  const avisadoEn = useRef<number | null>(null);

  const enPausa = d?.estado === "en_pausa";
  const desdeMs = d ? Date.parse(d.desde) : 0;
  const transcurrido = enPausa ? ahora + desfase - desdeMs : 0;
  const minutos = minutosDesde(desdeMs, ahora + desfase);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Cada pausa nueva empieza otra vez en 15 minutos.
  useEffect(() => {
    setUmbral(AVISO_PAUSA_MS);
    setModal(false);
    avisadoEn.current = null;
  }, [d?.desde, d?.estado]);

  useEffect(() => {
    if (!enPausa || transcurrido < umbral || avisadoEn.current === umbral) return;
    avisadoEn.current = umbral;
    setModal(true);
    // Con la pestaña en segundo plano el modal no se ve: notificación del navegador y sonido.
    if (document.hidden) {
      pitar();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const n = new Notification("Home Outlet", { body: `Lleva ${Math.floor(transcurrido / 60_000)} minutos en pausa. ¿Desea volver a recibir conversaciones?`, tag: "pausa-larga" });
        n.onclick = () => window.focus();
      }
    }
  }, [enPausa, transcurrido, umbral]);

  if (!d) return null;

  const cambiar = async (accion: () => ReturnType<typeof pausar>) => {
    setOcupado(true);
    const r = await accion();
    setOcupado(false);
    if (!r.ok) return void avisar(r.error, "error");
    poner(r.disponibilidad);
  };
  const alPausar = (motivo: string | null) => {
    // El permiso de notificaciones se pide la primera vez que la persona pausa (necesita un clic suyo).
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    void cambiar(() => pausar(motivo));
  };
  const alActivar = () => {
    setModal(false);
    void cambiar(() => activarme());
  };

  return (
    <>
      <div className="sticky top-0 z-20 flex h-12 items-center justify-end border-b border-linea bg-superficie px-6 max-md:px-4 print:hidden">
        <ControlDisponibilidad estado={d.estado} minutos={minutos} motivo={d.motivo} ocupado={ocupado} onPausar={alPausar} onActivar={alActivar} />
      </div>
      <ModalPausaLarga
        abierto={modal && enPausa}
        minutos={Math.max(1, Math.floor(transcurrido / 60_000))}
        ocupado={ocupado}
        onActivar={alActivar}
        onSeguir={() => {
          setModal(false);
          setUmbral(transcurrido + AVISO_PAUSA_MS); // el aviso se repite 15 minutos después
        }}
      />
    </>
  );
}
