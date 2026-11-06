"use client";

import { useEffect, useState } from "react";
import { cambiarEstadoDeAsesor, obtenerPanelEquipo, repartirDeAsesor } from "@/app/(app)/equipo/actions";
import { TablaEquipo } from "@/components/ui/equipo";
import { Boton, ControlSegmentado, Interruptor } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { AjustesEquipo } from "@/lib/equipo/ajustes";
import type { FilaEquipo } from "@/lib/equipo/tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { guardarAjustesEquipo } from "../actions";

/** Reglas del equipo: cómo se reparten las conversaciones y qué ve cada asesor. */
export function Equipo({ inicial }: { inicial: AjustesEquipo }) {
  const avisar = useToast();
  const [ajustes, setAjustes] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const { datos: filas, refrescar } = useActualizacion("panel-equipo", obtenerPanelEquipo, 10_000);
  const [ahora, setAhora] = useState(() => Date.now());
  const [repartir, setRepartir] = useState<FilaEquipo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const cambiarEstado = async (id: string, estado: string) => {
    const r = await cambiarEstadoDeAsesor(id, estado);
    avisar(r.ok ? "Estado cambiado" : r.error, r.ok ? "exito" : "error");
    refrescar();
  };
  const confirmarReparto = async () => {
    if (!repartir) return;
    setOcupado(repartir.id);
    const r = await repartirDeAsesor(repartir.id);
    setOcupado(null);
    setRepartir(null);
    if (!r.ok) avisar(r.error, "error");
    else avisar(r.sinAsesor ? `Se repartieron ${r.repartidas}. ${r.sinAsesor} quedaron en «Sin asignar»: no hay otro asesor disponible.` : `Se repartieron ${r.repartidas} conversaciones.`);
    refrescar();
  };

  const guardar = async (cambio: Partial<AjustesEquipo>) => {
    const previo = ajustes;
    setAjustes({ ...ajustes, ...cambio });
    setGuardando(true);
    const r = await guardarAjustesEquipo(cambio);
    setGuardando(false);
    if (!r.ok) {
      setAjustes(previo);
      return void avisar(r.error, "error");
    }
    avisar("Ajustes guardados");
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Asignación" className="flex max-w-3xl flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 className="titulo-panel">Asignación de conversaciones</h2>
        <ControlSegmentado
          etiqueta="Modo de asignación"
          valor={ajustes.modoAsignacion}
          disabled={guardando}
          onCambio={(v) => void guardar({ modoAsignacion: v })}
          opciones={[
            { valor: "manual", texto: "Manual" },
            { valor: "automatica", texto: "Automática" },
          ]}
        />
        <p className="cuerpo text-texto-suave">
          {ajustes.modoAsignacion === "automatica"
            ? "Cuando el asistente pasa una conversación a un asesor, o llega un mensaje y el asistente está apagado, se asigna sola al asesor disponible con menos conversaciones abiertas (primero al asesor responsable del cliente, si está disponible)."
            : "Nada se asigna solo: todo queda en «Sin asignar» y un administrador o un jefe de tienda reparte."}
        </p>
      </section>

      <section aria-label="Visibilidad" className="flex max-w-3xl flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 className="titulo-panel">Qué ve cada asesor</h2>
        <Interruptor etiqueta="Los asesores ven solo sus conversaciones" activo={ajustes.asesoresVenSoloSuyas} disabled={guardando} onCambio={(v) => void guardar({ asesoresVenSoloSuyas: v })} />
        <p className="cuerpo text-texto-suave">
          {ajustes.asesoresVenSoloSuyas
            ? "Cada asesor ve únicamente las conversaciones asignadas a él, y los contactos y pedidos ligados a ellas. Los administradores y los jefes de tienda ven todo."
            : "Todos los asesores ven todas las conversaciones, contactos y pedidos."}
        </p>
      </section>

      <section aria-label="Equipo" className="flex flex-col gap-3">
        <h2 className="titulo-panel">Asesores</h2>
        <p className="cuerpo text-texto-suave">
          Si una persona tiene la aplicación abierta, vuelve a quedar Disponible sola unos segundos después de que usted la ponga En pausa o Desconectada.
        </p>
        {filas && filas.length === 0 ? (
          <p className="cuerpo rounded-tarjeta border border-dashed border-linea p-4 text-texto-suave">Todavía no hay asesores. Invítelos en Ajustes → Usuarios.</p>
        ) : (
          <TablaEquipo filas={filas ?? []} ahora={ahora} ocupadoId={ocupado} onCambiarEstado={(id, e) => void cambiarEstado(id, e)} onRepartir={setRepartir} />
        )}
      </section>

      <Modal abierto={repartir !== null} onCerrar={() => setRepartir(null)} titulo="Repartir conversaciones">
        <p className="cuerpo mb-4">
          Las {repartir?.abiertas} conversaciones abiertas de <strong>{repartir?.nombre}</strong> se asignarán a los asesores disponibles, según las reglas de asignación. Las que no encuentren a nadie quedarán en «Sin asignar».
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setRepartir(null)}>
            Cancelar
          </Boton>
          <Boton cargando={ocupado !== null} onClick={() => void confirmarReparto()}>
            Repartir
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
