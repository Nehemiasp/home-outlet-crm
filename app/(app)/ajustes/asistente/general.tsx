"use client";

import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Insignia, nombreCanal } from "@/components/ui/etiquetas";
import { AreaTexto, Boton, CampoTexto, Casilla, Interruptor, Selector } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { CANALES } from "@/lib/canales/tipos";
import type { AjustesIa } from "@/lib/ia/ajustes-ia";
import { cn } from "@/lib/utils";
import { guardarAsistente } from "../actions";

type Presupuesto = { gasto: number; presupuesto: number; porcentaje: number; aviso: boolean; agotado: boolean };

export function General({ inicial, presupuesto, proveedor }: { inicial: AjustesIa; presupuesto: Presupuesto; proveedor: { nombre: string; modelo: string } }) {
  const router = useRouter();
  const avisar = useToast();
  const [d, setD] = useState({ ...inicial, limite: String(inicial.limiteRespuestas), monto: inicial.presupuestoMensualUsd === null ? "" : String(inicial.presupuestoMensualUsd) });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const limite = Number(d.limite);
    const monto = d.monto.trim() === "" ? null : Number(d.monto.replace(",", "."));
    if (!Number.isInteger(limite)) return setError("El límite de respuestas debe ser un número entero.");
    if (monto !== null && !Number.isFinite(monto)) return setError("El presupuesto debe ser un número, por ejemplo 20.");
    setGuardando(true);
    const r = await guardarAsistente({ encendido: d.encendido, canales: d.canales, modo: d.modo, bienvenida: d.bienvenida, limiteRespuestas: limite, presupuestoMensualUsd: monto });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Ajustes del asistente guardados");
    router.refresh();
  };
  const alternarCanal = (c: string, on: boolean) => setD({ ...d, canales: on ? [...d.canales, c] : d.canales.filter((x) => x !== c) });
  const pct = Math.min(100, Math.round(presupuesto.porcentaje));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section aria-label="Estado" className="flex flex-col gap-2 rounded-tarjeta border border-linea bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Bot className="size-5" aria-hidden />
          <h2 className="titulo-panel">Estado del asistente</h2>
          {proveedor.nombre === "simulado" ? <Insignia tono="aviso">Asistente en modo de prueba</Insignia> : <Insignia tono="exito">Conectado a Claude · {proveedor.modelo}</Insignia>}
        </div>
        <p className="cuerpo text-texto-suave">
          {proveedor.nombre === "simulado"
            ? "Responde con reglas simples y las mismas herramientas que el real, sin clave de la API ni costo. Para usar Claude, configure AI_PROVIDER=anthropic y ANTHROPIC_API_KEY en el servidor."
            : "Responde con la API de Claude. El modelo se cambia con la variable AI_MODEL."}
        </p>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="cuerpo-fuerte">Presupuesto de este mes</p>
            <p className="meta text-texto-suave">
              USD {presupuesto.gasto.toFixed(2)} de {presupuesto.presupuesto.toFixed(2)} ({pct} %)
            </p>
          </div>
          <div role="progressbar" aria-label="Presupuesto del mes usado" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-1 h-2 overflow-hidden rounded-pildora bg-linea">
            <div className={cn("h-full rounded-pildora", presupuesto.agotado ? "bg-error" : presupuesto.aviso ? "bg-aviso" : "bg-exito")} style={{ width: `${pct}%` }} />
          </div>
          {presupuesto.agotado && <p className="meta mt-1 text-error">El presupuesto se agotó: el asistente está apagado y las conversaciones quedan para los asesores.</p>}
        </div>
      </section>

      <form onSubmit={guardar} className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
        <Interruptor etiqueta={d.encendido ? "Asistente encendido" : "Asistente apagado"} activo={d.encendido} onCambio={(v) => setD({ ...d, encendido: v })} />

        <fieldset className="flex flex-col gap-1">
          <legend className="cuerpo-fuerte">Canales donde responde</legend>
          <div className="flex flex-wrap gap-x-6">
            {CANALES.map((c) => (
              <Casilla key={c} etiqueta={nombreCanal(c)} checked={d.canales.includes(c)} onChange={(e) => alternarCanal(c, e.target.checked)} />
            ))}
          </div>
          <p className="meta text-texto-suave">Solo puede responder por los canales que estén conectados (ver Canales).</p>
        </fieldset>

        <Selector
          etiqueta="Cuándo responde"
          value={d.modo}
          onCambio={(v) => setD({ ...d, modo: v as AjustesIa["modo"] })}
          opciones={[
            { valor: "siempre", texto: "Siempre" },
            { valor: "fuera_de_horario", texto: "Solo fuera del horario de la tienda" },
            { valor: "sin_asesores", texto: "Solo cuando no hay asesores conectados" },
          ]}
          ayuda="Se decide cuando entra una conversación nueva. Si una persona escribe o toma la conversación, el asistente se calla."
        />

        <AreaTexto etiqueta="Mensaje de bienvenida" maxLength={600} value={d.bienvenida} onChange={(e) => setD({ ...d, bienvenida: e.target.value })} ayuda="Es lo primero que lee el cliente. Debe decir que es un asistente virtual." />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Respuestas seguidas antes de pasar a un asesor" inputMode="numeric" autoComplete="off" value={d.limite} onChange={(e) => setD({ ...d, limite: e.target.value })} ayuda="Por defecto 6." />
          <CampoTexto
            etiqueta="Presupuesto mensual (USD)"
            inputMode="decimal"
            autoComplete="off"
            value={d.monto}
            onChange={(e) => setD({ ...d, monto: e.target.value })}
            ayuda="Al 80 % se avisa a los administradores; al 100 % el asistente se apaga. Vacío usa el valor del servidor."
          />
        </div>

        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <Boton type="submit" cargando={guardando} className="self-start">
          Guardar
        </Boton>
      </form>
    </div>
  );
}
