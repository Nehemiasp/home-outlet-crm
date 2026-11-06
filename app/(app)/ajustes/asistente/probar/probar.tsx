"use client";

import { RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Burbuja } from "@/components/ui/conversacion";
import { Boton } from "@/components/ui/form";
import { probar } from "../../actions";

type Turno =
  | { de: "cliente"; texto: string }
  | { de: "asistente"; texto: string; detalle: { herramientas: string[]; consultado: string[]; tokensEntrada: number; tokensSalida: number; ms: number; costoUsd: number; proveedor: string; modelo: string; derivar?: string } }
  | { de: "sistema"; texto: string };

const EJEMPLOS = ["¿Cuánto cuesta la pantalla para carro?", "¿Hay audífonos inalámbricos?", "¿Cuál es el horario?", "¿Hacen envíos a Morales?", "Quiero comprarlo", "¿Quién ganó el partido de ayer?"];

/** Chat para escribirle al asistente como si fuera un cliente. No crea conversaciones ni manda mensajes de verdad. */
export function Probar({ bienvenida }: { bienvenida: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [turnos.length, pensando]);

  const enviar = async (mensaje: string) => {
    const limpio = mensaje.trim();
    if (!limpio || pensando) return;
    const previos = [...turnos, { de: "cliente" as const, texto: limpio }];
    setTurnos(previos);
    setTexto("");
    setPensando(true);
    const historial: { role: "user" | "assistant"; content: string }[] = [];
    for (const t of previos) {
      if (t.de === "cliente") historial.push({ role: "user", content: t.texto });
      else if (t.de === "asistente") historial.push({ role: "assistant", content: t.texto });
    }
    const r = await probar(historial);
    setPensando(false);
    if (!r) return setTurnos([...previos, { de: "sistema", texto: "No se pudo probar. Recargue la página e intente de nuevo." }]);
    const detalle = { herramientas: r.herramientas, consultado: r.consultado, tokensEntrada: r.uso.inputTokens, tokensSalida: r.uso.outputTokens, ms: r.ms, costoUsd: r.costoUsd, proveedor: r.proveedor, modelo: r.modelo, derivar: r.derivar };
    const nuevos: Turno[] = [];
    if (r.derivar) {
      nuevos.push({ de: "asistente", texto: r.textoDerivacion, detalle });
      nuevos.push({ de: "sistema", texto: `El asistente pasaría la conversación a un asesor · Motivo: ${r.derivar}` });
    } else if (r.error || !r.texto) nuevos.push({ de: "asistente", texto: "Un asesor le responderá en breve.", detalle }, { de: "sistema", texto: "Hubo un error o se agotó el tiempo: el asistente pasaría la conversación a un asesor." });
    else nuevos.push({ de: "asistente", texto: r.texto, detalle });
    setTurnos([...previos, ...nuevos]);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="cuerpo text-texto-suave">Escríbale al asistente como si fuera un cliente. Aquí no se crean conversaciones ni se manda nada a nadie: sirve para revisar los cambios en las preguntas frecuentes antes de activarlos.</p>

      <div className="flex flex-wrap gap-2" aria-label="Ejemplos">
        {EJEMPLOS.map((e) => (
          <button key={e} type="button" disabled={pensando} onClick={() => void enviar(e)} className="meta cursor-pointer rounded-pildora border border-linea bg-superficie px-3 py-2 hover:bg-fondo disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11">
            {e}
          </button>
        ))}
      </div>

      <section aria-label="Chat de prueba" className="flex h-[480px] flex-col overflow-hidden rounded-tarjeta border border-linea bg-superficie">
        <div role="log" aria-live="polite" className="relative flex flex-1 flex-col gap-3 overflow-y-auto bg-fondo p-4">
          <Burbuja tipo="saliente" asistente texto={bienvenida} />
          {turnos.map((t, i) =>
            t.de === "cliente" ? (
              <Burbuja key={i} tipo="entrante" texto={t.texto} />
            ) : t.de === "sistema" ? (
              <Burbuja key={i} tipo="sistema" texto={t.texto} />
            ) : (
              <div key={i} className="flex flex-col gap-1">
                <Burbuja tipo="saliente" asistente texto={t.texto} consultas={t.detalle.consultado} />
                <p className="meta self-end text-right text-texto-suave">
                  {t.detalle.herramientas.length ? `Herramientas: ${t.detalle.herramientas.join(", ")}` : "Sin herramientas"} · {t.detalle.tokensEntrada} + {t.detalle.tokensSalida} tokens · {t.detalle.ms} ms ·{" "}
                  {t.detalle.proveedor === "simulado" ? "sin costo (modo de prueba)" : `USD ${t.detalle.costoUsd.toFixed(4)} estimado`}
                </p>
              </div>
            ),
          )}
          {pensando && <p className="meta text-texto-suave">El asistente está escribiendo…</p>}
          <div ref={fin} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
          className="flex gap-2 border-t border-linea p-2"
        >
          <input aria-label="Mensaje del cliente de prueba" placeholder="Escriba como cliente" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} className="cuerpo h-10 min-w-0 flex-1 rounded-campo border border-texto-suave px-3 hover:border-texto" />
          <Boton type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar mensaje de prueba">
            <Send className="size-4" aria-hidden />
          </Boton>
          <Boton variante="secundario" onClick={() => setTurnos([])} disabled={turnos.length === 0 || pensando}>
            <RotateCcw className="size-4" aria-hidden />
            Nueva prueba
          </Boton>
        </form>
      </section>
    </div>
  );
}
