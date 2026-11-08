"use client";

import { ChevronDown, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Boton, Selector } from "./form";
import { InsigniaDisponibilidad, minutosDesde } from "./disponibilidad";
import { MenuDesplegable, Modal, Tabla } from "./estructura";
import { cn } from "@/lib/utils";
import type { EstadoAsesorVista, FilaEquipo } from "@/lib/equipo/tipos";

const ESTADOS: { valor: EstadoAsesorVista; texto: string }[] = [
  { valor: "disponible", texto: "Disponible" },
  { valor: "en_pausa", texto: "En pausa" },
  { valor: "desconectado", texto: "Desconectado" },
];

/** «hace 12 min», «hace 2 h 05 min». */
export function hace(desdeMs: number, ahoraMs: number) {
  const min = minutosDesde(desdeMs, ahoraMs);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * El equipo en una tabla: cada asesor con su estado, desde hace cuánto, el motivo de la pausa y cuántas
 * conversaciones abiertas tiene. Con más de 30 minutos en pausa o desconectado y conversaciones abiertas,
 * aparece «Repartir sus conversaciones».
 */
export function TablaEquipo({ filas, ahora, ocupadoId, onCambiarEstado, onRepartir }: { filas: FilaEquipo[]; ahora: number; ocupadoId?: string | null; onCambiarEstado: (id: string, estado: EstadoAsesorVista) => void; onRepartir: (fila: FilaEquipo) => void }) {
  return (
    <Tabla<FilaEquipo>
      descripcion="Asesores del equipo con su estado y sus conversaciones abiertas"
      filas={filas}
      idFila={(f) => f.id}
      pagina={1}
      totalPaginas={1}
      onPagina={() => {}}
      columnas={[
        { clave: "nombre", titulo: "Asesor", render: (f) => <span className="cuerpo-fuerte whitespace-nowrap">{f.nombre}</span> },
        { clave: "estado", titulo: "Estado", render: (f) => <InsigniaDisponibilidad estado={f.estado} motivo={f.motivo} /> },
        { clave: "desde", titulo: "Desde", render: (f) => <span className="whitespace-nowrap text-texto-suave">{hace(Date.parse(f.desde), ahora)}</span> },
        { clave: "abiertas", titulo: "Abiertas", alinear: "der", render: (f) => <span className="cuerpo-fuerte">{f.abiertas}</span> },
        {
          clave: "acciones",
          titulo: "Acciones",
          render: (f) => (
            <div className="flex flex-wrap items-center gap-2">
              <MenuDesplegable
                etiqueta="Cambiar estado"
                opciones={ESTADOS.filter((e) => e.valor !== f.estado).map((e) => ({ texto: e.texto, onElegir: () => onCambiarEstado(f.id, e.valor) }))}
              />
              {f.puedeRepartir && (
                <Boton variante="secundario" cargando={ocupadoId === f.id} onClick={() => onRepartir(f)}>
                  Repartir sus conversaciones
                </Boton>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

/** Resumen del equipo para la bandeja del administrador: quién está disponible y cuántas conversaciones lleva cada uno. */
export function ResumenEquipo({ filas, ahora, enlace }: { filas: FilaEquipo[]; ahora: number; enlace: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const disponibles = filas.filter((f) => f.estado === "disponible").length;
  return (
    <section aria-label="Equipo" className="mx-4 mb-3 rounded-tarjeta border border-linea bg-superficie">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="cuerpo-fuerte flex min-h-10 w-full cursor-pointer items-center gap-2 px-3 text-left max-md:min-h-11"
      >
        <Users className="size-4 shrink-0 text-texto-suave" aria-hidden />
        <span className="flex-1">Equipo · {disponibles} de {filas.length} disponibles</span>
        <ChevronDown className={cn("size-4 transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 border-t border-linea p-3">
          <ul className="flex flex-col gap-2">
            {filas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="cuerpo-fuerte">{f.nombre}</span>
                <span className="flex items-center gap-2">
                  <InsigniaDisponibilidad estado={f.estado} minutos={f.estado === "en_pausa" ? minutosDesde(Date.parse(f.desde), ahora) : undefined} />
                  <span className="meta text-texto-suave" aria-label={`${f.abiertas} conversaciones abiertas`}>
                    {f.abiertas} abiertas
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {enlace}
        </div>
      )}
    </section>
  );
}

/** Ventana para pasar una conversación a otra persona del equipo: se elige de una lista (en vez de una opción de menú por cada persona). */
export function ModalAsignar({ abierto, ocupado, usuarios, actualId, yoId, onCerrar, onAsignar, onQuitar }: { abierto: boolean; ocupado?: boolean; usuarios: { id: string; nombre: string }[]; actualId: string | null; yoId: string; onCerrar: () => void; onAsignar: (usuarioId: string) => void; onQuitar?: () => void }) {
  const [elegido, setElegido] = useState("");
  useEffect(() => {
    if (abierto) setElegido("");
  }, [abierto]);
  const opciones = usuarios.map((u) => ({ valor: u.id, texto: `${u.nombre}${u.id === yoId ? " (yo)" : ""}${u.id === actualId ? " · la atiende ahora" : ""}`, deshabilitada: u.id === actualId }));
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Asignar a otra persona">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (elegido) onAsignar(elegido);
        }}
      >
        <p className="cuerpo">La conversación pasará a la persona que elija y ella recibirá el aviso.</p>
        <Selector etiqueta="Pasar a" placeholder="Elegir persona…" opciones={opciones} value={elegido} onCambio={setElegido} />
        <div className="flex flex-wrap justify-end gap-2">
          {onQuitar && (
            <Boton variante="fantasma" onClick={onQuitar} className="mr-auto">
              Quitar asignación
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={!elegido} cargando={ocupado}>
            Asignar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

/** Pide un motivo opcional antes de devolver una conversación a la cola. */
export function ModalDevolver({ abierto, ocupado, onCerrar, onDevolver }: { abierto: boolean; ocupado?: boolean; onCerrar: () => void; onDevolver: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Devolver a la cola">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onDevolver(motivo);
          setMotivo("");
        }}
      >
        <p className="cuerpo">La conversación dejará de ser suya y se asignará a otro asesor disponible. Usted no volverá a recibirla en este reparto.</p>
        <label className="flex flex-col gap-1">
          <span className="cuerpo-fuerte">Motivo (opcional)</span>
          <input
            type="text"
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por ejemplo: es de otra sucursal"
            className="cuerpo h-10 w-full rounded-campo border border-texto-suave bg-superficie px-3 hover:border-texto"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={ocupado}>
            Devolver a la cola
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
