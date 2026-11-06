"use client";

import { ArrowLeft, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContenidoContacto } from "@/components/contacto/contenido";
import { IconoCanal, InsigniaConversacion } from "@/components/ui/etiquetas";
import { Boton, Selector } from "@/components/ui/form";
import { ListaCompras } from "@/components/ui/pedidos";
import { useToast } from "@/components/ui/toast";
import { formatQ } from "@/lib/utils";
import { ETIQUETA_MOTIVO, MOTIVOS } from "@/lib/ia/tipos";
import { cambiarMotivo, resumir } from "./actions";
import type { ConversacionDTO } from "@/lib/bandeja-tipos";
import { horaLista } from "./formato";

/** Panel del contacto dentro de la bandeja. En móvil ocupa toda la pantalla. */
export function Ficha({ c, onCambio, onCerrar }: { c: ConversacionDTO; onCambio: () => void; onCerrar: () => void }) {
  const avisar = useToast();
  const [resumiendo, setResumiendo] = useState(false);
  const generarResumen = async () => {
    setResumiendo(true);
    const r = await resumir(c.id);
    setResumiendo(false);
    if (!r.ok) avisar(r.error, "error");
    onCambio();
  };
  const elegirMotivo = async (m: string) => {
    const r = await cambiarMotivo(c.id, m);
    if (!r.ok) avisar(r.error, "error");
    onCambio();
  };
  return (
    <aside aria-label="Ficha del contacto" className="flex w-full flex-col overflow-y-auto bg-superficie lg:w-80 lg:shrink-0 lg:border-l lg:border-linea">
      <div className="flex items-center gap-2 border-b border-linea p-4">
        <Boton variante="fantasma" tamano="sm" className="lg:hidden" onClick={onCerrar} aria-label="Volver a la conversación">
          <ArrowLeft className="size-4" aria-hidden />
        </Boton>
        <h2 className="titulo-panel flex-1">Ficha</h2>
        <Boton variante="fantasma" tamano="sm" className="max-lg:hidden" onClick={onCerrar} aria-label="Ocultar ficha">
          <X className="size-4" aria-hidden />
        </Boton>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-b border-linea p-4">
        <div>
          <dt className="titulo-seccion text-texto-suave">Total comprado</dt>
          <dd className="cuerpo-fuerte tabular-nums">{formatQ(c.compras.totalComprado)}</dd>
        </div>
        <div>
          <dt className="titulo-seccion text-texto-suave">Pedidos</dt>
          <dd className="cuerpo-fuerte tabular-nums">{c.compras.cantidad}</dd>
        </div>
      </dl>

      <div className="flex flex-col divide-y divide-linea *:px-4 *:py-4">
        <ContenidoContacto contacto={c.contacto} etiquetasDisponibles={c.etiquetasDisponibles} onCambio={onCambio} />

        <section aria-label="Esta conversación" className="flex flex-col gap-3">
          <h3 className="titulo-seccion text-texto-suave">Esta conversación</h3>
          <Selector
            etiqueta="Motivo de la consulta"
            value={c.motivo ?? ""}
            onCambio={elegirMotivo}
            placeholder="Sin etiquetar"
            opciones={MOTIVOS.map((m) => ({ valor: m, texto: ETIQUETA_MOTIVO[m] }))}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="cuerpo-fuerte">Resumen</p>
              <Boton variante="secundario" tamano="sm" cargando={resumiendo} onClick={generarResumen}>
                {c.resumen ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {c.resumen ? "Regenerar" : "Generar resumen"}
              </Boton>
            </div>
            {c.resumen ? (
              <>
                <p className="cuerpo whitespace-pre-wrap rounded-campo bg-fondo p-3">{c.resumen.texto}</p>
                <p className="meta text-texto-suave">Generado el {new Date(c.resumen.creado).toLocaleString("es-GT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
              </>
            ) : (
              <p className="cuerpo text-texto-suave">Todavía no hay resumen de esta conversación.</p>
            )}
          </div>
        </section>

        <section aria-label="Historial de conversaciones">
          <h3 className="titulo-seccion mb-2 text-texto-suave">Conversaciones anteriores</h3>
          {c.historial.length === 0 ? (
            <p className="cuerpo text-texto-suave">Es la única conversación de este contacto.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
              {c.historial.map((h) => (
                <li key={h.id}>
                  <Link href={`/bandeja/${h.id}`} className="flex flex-col gap-1 p-3 hover:bg-fondo">
                    <span className="flex items-center gap-2">
                      <IconoCanal canal={h.canal} />
                      <InsigniaConversacion estado={h.estado} />
                      <span className="meta ml-auto text-texto-suave">{horaLista(h.fecha)}</span>
                    </span>
                    <span className="cuerpo truncate text-texto-suave">{h.ultimo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Compras">
          <h3 className="titulo-seccion mb-2 text-texto-suave">Compras</h3>
          <ListaCompras compras={c.compras} resumen={false} />
        </section>
      </div>
    </aside>
  );
}
