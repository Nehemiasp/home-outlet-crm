"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaTexto, Boton, CampoTexto } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DIAS, type HorarioSemanal } from "@/lib/horario";
import { cn } from "@/lib/utils";
import { guardarNegocio } from "../actions";

type Datos = { nombre: string; horario: string; direccion: string; pagos: string; envios: string; garantia: string; horarioSemanal: HorarioSemanal | null };

const HORARIO_BASE: HorarioSemanal = DIAS.map(() => ({ abre: "08:00", cierra: "18:00" }));

/** Horario por día: lo usa el asistente para saber si la tienda está abierta. */
function EditorHorario({ valor, onCambio }: { valor: HorarioSemanal; onCambio: (h: HorarioSemanal) => void }) {
  const poner = (i: number, d: HorarioSemanal[number]) => onCambio(valor.map((x, k) => (k === i ? d : x)));
  const campo = "cuerpo h-10 rounded-campo border border-texto-suave bg-superficie px-2 hover:border-texto disabled:cursor-not-allowed disabled:bg-fondo disabled:text-texto-suave";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="cuerpo-fuerte mb-1">Horario por día</legend>
      {DIAS.map((dia, i) => {
        const d = valor[i];
        return (
          <div key={dia} className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-10 w-40 cursor-pointer items-center gap-2 cuerpo">
              <input type="checkbox" className="size-5 cursor-pointer" checked={!!d} onChange={(e) => poner(i, e.target.checked ? { abre: "08:00", cierra: "18:00" } : null)} />
              {dia}
            </label>
            <label className={cn("flex items-center gap-2 meta text-texto-suave", !d && "opacity-50")}>
              Abre
              <input type="time" aria-label={`${dia}: hora de apertura`} className={campo} disabled={!d} value={d?.abre ?? "08:00"} onChange={(e) => d && poner(i, { ...d, abre: e.target.value })} />
            </label>
            <label className={cn("flex items-center gap-2 meta text-texto-suave", !d && "opacity-50")}>
              Cierra
              <input type="time" aria-label={`${dia}: hora de cierre`} className={campo} disabled={!d} value={d?.cierra ?? "18:00"} onChange={(e) => d && poner(i, { ...d, cierra: e.target.value })} />
            </label>
            {!d && <span className="meta text-texto-suave">Cerrado</span>}
          </div>
        );
      })}
    </fieldset>
  );
}

export function Negocio({ inicial }: { inicial: Datos }) {
  const router = useRouter();
  const avisar = useToast();
  const [d, setD] = useState(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const r = await guardarNegocio(d);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Datos del negocio guardados");
    router.refresh();
  };
  const campo = (k: Exclude<keyof Datos, "horarioSemanal">) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }) });

  return (
    <section aria-label="Datos del negocio" className="flex max-w-2xl flex-col gap-4">
      <p className="cuerpo text-texto-suave">
        Se usan en las respuestas rápidas con <code className="cuerpo-fuerte">{"{negocio}"}</code>, <code className="cuerpo-fuerte">{"{horario}"}</code>, <code className="cuerpo-fuerte">{"{direccion}"}</code>, <code className="cuerpo-fuerte">{"{pagos}"}</code>, <code className="cuerpo-fuerte">{"{envios}"}</code> y <code className="cuerpo-fuerte">{"{garantia}"}</code> (más <code className="cuerpo-fuerte">{"{cuentas}"}</code>, que sale de Pagos y envíos), y el asistente los consulta para responder a los clientes.
      </p>
      <form onSubmit={guardar} className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
        <CampoTexto etiqueta="Nombre del negocio" autoComplete="off" maxLength={80} {...campo("nombre")} />
        <AreaTexto etiqueta="Horario de atención (como lo lee el cliente)" maxLength={500} ayuda="Por ejemplo: Lunes a sábado de 8:00 a 18:00." {...campo("horario")} />
        <EditorHorario valor={d.horarioSemanal ?? HORARIO_BASE} onCambio={(h) => setD({ ...d, horarioSemanal: h })} />
        <AreaTexto etiqueta="Dirección" maxLength={500} ayuda="Con referencias para llegar, si hacen falta." {...campo("direccion")} />
        <AreaTexto etiqueta="Formas de pago" maxLength={500} {...campo("pagos")} />
        <AreaTexto etiqueta="Envíos" maxLength={500} ayuda="Municipios a los que envían y cómo se calcula el costo." {...campo("envios")} />
        <AreaTexto etiqueta="Garantía" maxLength={500} {...campo("garantia")} />
        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <Boton type="submit" cargando={guardando} className="self-start">
          Guardar
        </Boton>
      </form>
    </section>
  );
}
