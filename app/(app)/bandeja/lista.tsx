"use client";

import { Inbox, SearchX, WifiOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ItemConversacion } from "@/components/ui/conversacion";
import { EsqueletoConversacion, EstadoVacio } from "@/components/ui/estados";
import { opcionCanal } from "@/components/ui/etiquetas";
import { Boton, Buscador, Selector } from "@/components/ui/form";
import { BotonFiltros, PestanasConContador } from "@/components/ui/estructura";
import { ResumenEquipo } from "@/components/ui/equipo";
import { obtenerPanelEquipo } from "@/app/(app)/equipo/actions";
import Link from "next/link";
import type { Filtros } from "@/lib/bandeja-tipos";
import { CANALES } from "@/lib/canales/tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { listar } from "./actions";
import { horaLista } from "./formato";

const POR_PAGINA = 30;

/**
 * `soloMias`: el asesor con la visibilidad limitada solo ve «Mías». `veTodo`: el filtro «Asesor» es solo del administrador.
 */
/** `compartida`: en la bandeja compartida la lista abre en «Todas» (ahí nada se mueve de pestaña al responder). */
export function ListaConversaciones({ idActivo, soloMias, veTodo, compartida }: { idActivo?: string; soloMias: boolean; veTodo: boolean; compartida: boolean }) {
  const router = useRouter();
  const vista = useSearchParams().get("vista");
  const [tab, setTab] = useState<Filtros["tab"]>(soloMias ? "mias" : vista === "mias" || vista === "todas" || vista === "sin-asignar" ? vista : compartida ? "todas" : "sin-asignar");
  const [estado, setEstado] = useState<Filtros["estado"]>("todos");
  const [canal, setCanal] = useState<Filtros["canal"]>("todos");
  const [asesor, setAsesor] = useState("todos");
  const [atencion, setAtencion] = useState<Filtros["atencion"]>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const lista = useRef<HTMLUListElement>(null);
  const { datos: equipo } = useActualizacion("resumen-equipo", veTodo ? obtenerPanelEquipo : async () => [], 15_000);

  // La búsqueda espera a que termine de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const filtros: Filtros = { tab, atencion, estado, canal, asesor, q, limite };
  // Cada respuesta lleva la pestaña que la pidió: al cambiar de pestaña, los datos anteriores siguen un instante y no deben contar.
  const { datos, fallo, refrescar } = useActualizacion(JSON.stringify(filtros), async () => ({ ...(await listar(filtros)), tab: filtros.tab }), 4000);

  // Si la conversación abierta estaba en la lista y deja de cumplir la pestaña (por ejemplo, alguien le respondió y ya no está
  // «Sin asignar»), la lista pasa a «Todas» para que no se pierda de vista. Cambiar de pestaña a mano no lo dispara.
  const abiertaEnLista = useRef<string | null>(null);
  useEffect(() => {
    if (!datos || !idActivo || datos.tab !== tab) return;
    const esta = datos.items.some((i) => i.id === idActivo);
    if (esta) abiertaEnLista.current = idActivo;
    else if (abiertaEnLista.current === idActivo && tab !== "todas" && !soloMias) {
      abiertaEnLista.current = null;
      setTab("todas");
    }
  }, [datos, idActivo, tab, soloMias]);
  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setLimite(POR_PAGINA);
  };

  // Flechas arriba y abajo recorren la lista; Enter abre la conversación enfocada.
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const botones = [...(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    const sig = botones[e.key === "ArrowDown" ? Math.min(i + 1, botones.length - 1) : Math.max(i - 1, 0)];
    if (sig) {
      e.preventDefault();
      sig.focus();
    }
  };

  const filtrosActivos = [estado !== "todos", canal !== "todos", atencion !== "todas", asesor !== "todos"].filter(Boolean).length;
  const sinFiltros = tab === "todas" && estado === "todos" && canal === "todos" && atencion === "todas" && !q;

  return (
    <>
      <div className="flex flex-col gap-3 p-4 pb-3">
        <h1 className="titulo-pagina">Bandeja</h1>
        <div className="flex items-end gap-2">
          <Buscador valor={busqueda} onCambio={cambiar(setBusqueda)} etiqueta="Buscar conversaciones" placeholder="Nombre, teléfono o texto" className="min-w-0 flex-1" />
          <BotonFiltros
            activos={filtrosActivos}
            onLimpiar={() => {
              setEstado("todos");
              setCanal("todos");
              setAtencion("todas");
              setAsesor("todos");
              setLimite(POR_PAGINA);
            }}
          >
            {veTodo && (
              <Selector
                etiqueta="Asesor"
                value={asesor}
                onCambio={cambiar(setAsesor)}
                opciones={[{ valor: "todos", texto: "Todos" }, { valor: "sin", texto: "Sin asignar" }, ...(datos?.asesores ?? []).map((a) => ({ valor: a.id, texto: a.nombre }))]}
              />
            )}
            <Selector
              etiqueta="Estado"
              value={estado}
              onCambio={cambiar((v: string) => setEstado(v as Filtros["estado"]))}
              opciones={[
                { valor: "todos", texto: "Todos" },
                { valor: "abierta", texto: "Abiertas" },
                { valor: "pendiente", texto: "Pendientes" },
                { valor: "cerrada", texto: "Cerradas" },
              ]}
            />
            <Selector
              etiqueta="Canal"
              value={canal}
              onCambio={cambiar((v: string) => setCanal(v as Filtros["canal"]))}
              opciones={[{ valor: "todos", texto: "Todos" }, ...CANALES.map(opcionCanal)]}
            />
            <Selector
              etiqueta="Atención"
              value={atencion}
              onCambio={cambiar((v: string) => setAtencion(v as Filtros["atencion"]))}
              opciones={[
                { valor: "todas", texto: "Todas" },
                { valor: "asistente", texto: "Atendidas por el asistente" },
                { valor: "esperando", texto: "Esperando asesor" },
              ]}
            />
          </BotonFiltros>
        </div>
      </div>
      {veTodo && equipo && equipo.length > 0 && (
        <ResumenEquipo
          filas={equipo}
          ahora={Date.now()}
          enlace={
            <Link href="/ajustes/equipo" className="cuerpo-fuerte self-start text-texto underline underline-offset-2 hover:no-underline">
              Ver el equipo
            </Link>
          }
        />
      )}
      <PestanasConContador
        etiqueta="Filtro de conversaciones"
        activa={tab}
        onCambio={cambiar((v: string) => {
          abiertaEnLista.current = null;
          setTab(v as Filtros["tab"]);
        })}
        pestanas={
          soloMias
            ? [{ id: "mias", texto: "Mías", contador: datos?.contadores.mias }]
            : [
                // En este orden lo pidió Home Outlet: primero todas, luego las propias y al final las que esperan a alguien.
                { id: "todas", texto: "Todas" },
                { id: "mias", texto: "Mías", contador: datos?.contadores.mias },
                { id: "sin-asignar", texto: "Sin asignar", contador: datos?.contadores.sinAsignar, urgente: true },
              ]
        }
      />

      <div className="flex-1 overflow-y-auto" role="region" aria-label="Lista de conversaciones" aria-live="polite">
        {!datos && fallo ? (
          <EstadoVacio
            icono={WifiOff}
            titulo="No pudimos cargar las conversaciones"
            descripcion="Revise su conexión. Se volverá a intentar solo."
            accion={
              <Boton variante="secundario" onClick={refrescar}>
                Reintentar
              </Boton>
            }
          />
        ) : !datos ? (
          <>
            <EsqueletoConversacion />
            <EsqueletoConversacion />
            <EsqueletoConversacion />
            <EsqueletoConversacion />
          </>
        ) : datos.items.length === 0 ? (
          sinFiltros ? (
            <EstadoVacio icono={Inbox} titulo="Todavía no hay mensajes" descripcion="Cuando un cliente escriba, aparecerá aquí." />
          ) : (
            <EstadoVacio icono={SearchX} titulo="No hay conversaciones con estos filtros" descripcion="Cambie los filtros o borre la búsqueda." />
          )
        ) : (
          <>
            <ul ref={lista} onKeyDown={alTeclear}>
              {datos.items.map((c) => (
                <li key={c.id}>
                  <ItemConversacion
                    nombre={c.nombre}
                    canal={c.canal}
                    ultimoMensaje={c.ultimo}
                    hora={horaLista(c.hora)}
                    noLeidos={c.id === idActivo ? 0 : c.noLeidos}
                    seleccionada={c.id === idActivo}
                    atencion={c.atencion}
                    estado={c.estado}
                    asesor={c.asesor}
                    asignados={c.asignados}
                    onClick={() => router.push(`/bandeja/${c.id}`)}
                  />
                </li>
              ))}
            </ul>
            {datos.hayMas && (
              <div className="p-4">
                <Boton variante="secundario" className="w-full" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                  Cargar más conversaciones
                </Boton>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
