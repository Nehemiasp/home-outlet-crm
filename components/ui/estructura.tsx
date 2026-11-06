"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, Info, ListFilter, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Boton } from "./form";
import { ContadorNoLeidos } from "./etiquetas";

/* ── Pestañas con contador opcional (flechas izquierda y derecha cambian de pestaña) ──
   Activa: indicador de 2 px naranja y texto principal. El contador es gris; solo es naranja si `urgente`
   (algo que necesita atención, por ejemplo «Por verificar 4»). */
export type Pestana = { id: string; texto: string; contador?: number; urgente?: boolean };

export function PestanasConContador({ pestanas, activa, onCambio, etiqueta }: { pestanas: Pestana[]; activa: string; onCambio: (id: string) => void; etiqueta: string }) {
  // En pantallas angostas la pestaña activa puede quedar fuera de vista: se desplaza hasta ella.
  useEffect(() => {
    document.getElementById(`pestana-${activa}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activa]);
  const alTeclear = (e: React.KeyboardEvent, i: number) => {
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const sig = pestanas[(i + paso + pestanas.length) % pestanas.length]!;
    onCambio(sig.id);
    document.getElementById(`pestana-${sig.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={etiqueta} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea">
      {pestanas.map((p, i) => {
        const esta = p.id === activa;
        return (
          <button
            key={p.id}
            id={`pestana-${p.id}`}
            role="tab"
            type="button"
            aria-selected={esta}
            tabIndex={esta ? 0 : -1}
            onClick={() => onCambio(p.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={cn(
              "cuerpo-fuerte -mb-px inline-flex h-10 cursor-pointer items-center gap-2 border-b-2 px-3 whitespace-nowrap transition-colors max-md:min-h-11",
              esta ? "border-naranja text-texto" : "border-transparent text-texto-suave hover:text-texto",
            )}
          >
            {p.texto}
            {p.contador ? (
              p.urgente ? (
                <ContadorNoLeidos cantidad={p.contador} etiqueta={`${p.contador} pendientes`} />
              ) : (
                <span aria-label={`${p.contador} en total`} className="mini inline-grid h-5 min-w-5 place-items-center rounded-pildora bg-linea px-1 text-texto">
                  {p.contador > 99 ? "99+" : p.contador}
                </span>
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Tabla con orden y paginación (controlada por quien la usa) ── */
export type Columna<T> = { clave: string; titulo: string; ordenable?: boolean; /** Cifras (totales, cantidades): a la derecha. */ alinear?: "der"; /** En teléfono se oculta para que entren las columnas que importan. */ ocultarMovil?: boolean; /** Se oculta en pantallas de menos de 1280 px (columnas de apoyo que no caben junto a la barra lateral). */ ocultarHastaXl?: boolean; render: (fila: T) => React.ReactNode };
export type Orden = { clave: string; dir: "asc" | "desc" };

/** Estilo de los enlaces dentro de una tabla (código de pedido, nombre de producto o de contacto): texto principal, no naranja. */
export const enlaceTabla = "cuerpo-fuerte text-texto hover:underline";

export function Tabla<T>({
  columnas,
  filas,
  idFila,
  alActivar,
  descripcion,
  orden,
  onOrden,
  pagina,
  totalPaginas,
  onPagina,
}: {
  columnas: Columna<T>[];
  filas: T[];
  idFila: (fila: T) => string;
  /** Hace clicable la fila completa. Debe haber también un enlace dentro de la fila para el teclado y los lectores de pantalla. */
  alActivar?: (fila: T) => void;
  /** Descripción para lectores de pantalla. */
  descripcion: string;
  orden?: Orden | null;
  onOrden?: (clave: string) => void;
  pagina: number;
  totalPaginas: number;
  onPagina: (pagina: number) => void;
}) {
  return (
    <div className="rounded-tarjeta border border-linea bg-superficie">
      {/* relative: el texto solo para lectores (sr-only) se posiciona dentro de la tabla y no ensancha la página */}
      <div className="relative overflow-x-auto">
        <table className="cuerpo w-full border-collapse">
          <caption className="sr-only">{descripcion}</caption>
          <thead>
            <tr className="border-b border-linea text-left">
              {columnas.map((c) => {
                const activa = orden?.clave === c.clave;
                return (
                  <th key={c.clave} scope="col" aria-sort={activa ? (orden.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("cuerpo-fuerte px-4 py-2 whitespace-nowrap", c.alinear === "der" && "text-right", c.ocultarMovil && "max-md:hidden", c.ocultarHastaXl && "max-xl:hidden")}>
                    {c.ordenable ? (
                      <button type="button" onClick={() => onOrden?.(c.clave)} className="inline-flex cursor-pointer items-center gap-1 hover:text-naranja-texto">
                        {c.titulo}
                        {activa && (orden.dir === "asc" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />)}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={idFila(f)}
                className={cn("border-b border-linea last:border-b-0 hover:bg-fondo", alActivar && "cursor-pointer")}
                // Los enlaces y botones de la fila siguen funcionando solos; el resto de la fila abre el detalle.
                onClick={alActivar ? (e) => !(e.target as HTMLElement).closest("a,button,input,select,textarea,label") && alActivar(f) : undefined}
              >
                {columnas.map((c) => (
                  <td key={c.clave} className={cn("px-4 py-3 align-middle", c.alinear === "der" && "text-right tabular-nums", c.ocultarMovil && "max-md:hidden", c.ocultarHastaXl && "max-xl:hidden")}>
                    {c.render(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && <Paginacion pagina={pagina} totalPaginas={totalPaginas} onPagina={onPagina} className="border-t border-linea" />}
    </div>
  );
}

export function Paginacion({ pagina, totalPaginas, onPagina, className }: { pagina: number; totalPaginas: number; onPagina: (pagina: number) => void; className?: string }) {
  return (
    <nav aria-label="Paginación" className={cn("flex items-center justify-between gap-2 p-3", className)}>
      <Boton variante="secundario" tamano="sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
        Anterior
      </Boton>
      <span className="meta text-texto-suave">
        Página {pagina} de {totalPaginas}
      </span>
      <Boton variante="secundario" tamano="sm" disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)}>
        Siguiente
      </Boton>
    </nav>
  );
}

/* ── Modal y panel lateral: los dos usan <dialog>, que ya trae foco atrapado y Escape ── */
type DialogoProps = { abierto: boolean; onCerrar: () => void; titulo: string; children: React.ReactNode; /** Más ancho, para contenido con imagen y datos lado a lado. */ grande?: boolean };

function Dialogo({ abierto, onCerrar, titulo, children, lado, grande }: DialogoProps & { lado: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      // Al abrir, el foco va al primer campo del formulario (si lo hay) y no al botón de cerrar.
      d.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea:not([disabled]), [role=combobox]:not([disabled])")?.focus();
    }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      className={cn(
        "bg-superficie p-0 text-texto shadow-menu backdrop:bg-carbon/50",
        lado ? "m-0 ml-auto h-dvh max-h-none w-full max-w-sm" : cn("m-auto w-[calc(100%-32px)] rounded-tarjeta", grande ? "max-w-3xl" : "max-w-lg"),
      )}
    >
      <div className={cn("flex flex-col", lado && "h-full")}>
        <div className="flex items-center justify-between gap-2 border-b border-linea p-4">
          <h2 id={idTitulo} className="titulo-panel">
            {titulo}
          </h2>
          <Boton variante="fantasma" tamano="sm" aria-label="Cerrar" onClick={onCerrar}>
            <X className="size-4" aria-hidden />
          </Boton>
        </div>
        <div className={cn("p-4", lado && "flex-1 overflow-y-auto")}>{children}</div>
      </div>
    </dialog>
  );
}

export const Modal = (p: DialogoProps) => <Dialogo {...p} lado={false} />;
export const PanelLateral = (p: DialogoProps) => <Dialogo {...p} lado />;

/* ── Menú desplegable ── */
export type OpcionMenu = { texto: string; onElegir: () => void; peligro?: boolean };

/**
 * Menú de acciones. Va en posición fija, calculada al abrirse: dentro de una tabla o un panel con scroll, un menú
 * «absolute» queda recortado y abre una barra de scroll. Se abre hacia arriba si abajo no cabe y se cierra al hacer scroll
 * o cambiar el tamaño de la ventana (así nunca queda flotando lejos de su botón).
 */
export function MenuDesplegable({ etiqueta, opciones, variante = "secundario" }: { etiqueta: string; opciones: OpcionMenu[]; variante?: "secundario" | "fantasma" }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const alternar = () => {
    if (!abierto) {
      const r = raiz.current?.getBoundingClientRect();
      if (r) {
        const alto = Math.min(opciones.length * 44 + 8, 320); // lo que mide el menú, con holgura
        const abajo = window.innerHeight - r.bottom;
        const derecha = Math.max(8, window.innerWidth - r.right);
        setPos(abajo < alto + 8 && r.top > abajo ? { bottom: window.innerHeight - r.top + 4, right: derecha } : { top: r.bottom + 4, right: derecha });
      }
    }
    setAbierto(!abierto);
  };

  useEffect(() => {
    if (!abierto) return;
    items.current[0]?.focus();
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    const mover = (e: Event) => !raiz.current?.contains(e.target as Node) && setAbierto(false); // el scroll del propio menú no lo cierra
    document.addEventListener("mousedown", fuera);
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", mover);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", mover);
    };
  }, [abierto]);

  const alTeclear = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Escape") {
      setAbierto(false);
      raiz.current?.querySelector("button")?.focus();
    }
    const paso = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (paso) {
      e.preventDefault();
      items.current[(i + paso + opciones.length) % opciones.length]?.focus();
    }
  };

  return (
    <div ref={raiz} className="relative inline-block">
      <Boton variante={variante} aria-haspopup="menu" aria-expanded={abierto} onClick={alternar}>
        {etiqueta}
        <ChevronDown className="size-4" aria-hidden />
      </Boton>
      {abierto && pos && (
        <div role="menu" style={pos} className="fixed z-30 max-h-80 min-w-48 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-tarjeta border border-linea bg-superficie py-1 shadow-menu">
          {opciones.map((o, i) => (
            <button
              key={o.texto}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitem"
              type="button"
              onKeyDown={(e) => alTeclear(e, i)}
              onClick={() => {
                setAbierto(false);
                o.onElegir();
              }}
              className={cn("cuerpo block w-full cursor-pointer px-3 py-2 text-left hover:bg-fondo max-md:min-h-11", o.peligro && "text-error")}
            >
              {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Línea de pasos: completados con check, el actual destacado y los futuros en texto suave.
   Si el proceso se detuvo (pedido cancelado o vencido), `detenido` recibe la insignia de peligro:
   la línea termina en el último paso alcanzado y la muestra al final. ── */
export function LineaDePasos({ pasos, actual, detenido, etiqueta }: { pasos: string[]; actual: number; detenido?: React.ReactNode; etiqueta: string }) {
  const visibles = detenido ? pasos.slice(0, actual + 1) : pasos;
  return (
    <ol aria-label={etiqueta} className="relative flex items-center gap-2 overflow-x-auto py-1">
      {visibles.map((texto, i) => {
        const hecho = i < actual || (!!detenido && i === actual);
        const esActual = i === actual && !detenido;
        return (
          <li key={texto} aria-current={esActual ? "step" : undefined} className="flex shrink-0 items-center gap-2">
            {i > 0 && <span aria-hidden className={cn("h-0.5 w-6 sm:w-10", i <= actual ? "bg-carbon" : "bg-linea")} />}
            <span
              className={cn(
                "inline-grid size-6 place-items-center rounded-pildora mini",
                hecho && "bg-carbon text-sobre-carbon",
                esActual && "bg-naranja text-carbon",
                !hecho && !esActual && "border border-linea bg-superficie text-texto-suave",
              )}
            >
              {hecho ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("meta", esActual ? "text-texto font-bold" : hecho ? "text-texto" : "text-texto-suave")}>
              {texto}
              <span className="sr-only">{hecho ? " (completado)" : esActual ? " (paso actual)" : " (pendiente)"}</span>
            </span>
          </li>
        );
      })}
      {detenido && (
        <li className="flex shrink-0 items-center gap-2">
          <span aria-hidden className="h-0.5 w-6 bg-carbon sm:w-10" />
          {detenido}
        </li>
      )}
    </ol>
  );
}

/* ── Aviso con ícono, texto y una acción (botón o enlace) ── */
const AVISOS = {
  aviso: { icono: TriangleAlert, clases: "bg-estado-aviso-fondo text-estado-aviso-texto border-estado-aviso-texto/30" },
  peligro: { icono: OctagonAlert, clases: "bg-estado-peligro-fondo text-estado-peligro-texto border-estado-peligro-texto/30" },
  info: { icono: Info, clases: "bg-estado-info-fondo text-estado-info-texto border-estado-info-texto/30" },
} as const;

export function AvisoAccionable({ tono = "aviso", children, accion, className }: { tono?: keyof typeof AVISOS; children: React.ReactNode; accion?: React.ReactNode; className?: string }) {
  const { icono: Icono, clases } = AVISOS[tono];
  return (
    <div role={tono === "peligro" ? "alert" : "status"} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tarjeta border px-3 py-2", clases, className)}>
      <Icono className="size-5 shrink-0" aria-hidden />
      <p className="cuerpo-fuerte min-w-40 flex-1">{children}</p>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}

/* ── Botón «Filtros» que abre un panel con los filtros menos usados; muestra cuántos hay activos ── */
export function BotonFiltros({ activos, onLimpiar, children, className }: { activos: number; onLimpiar?: () => void; children: React.ReactNode; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => raiz.current && !raiz.current.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      raiz.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  return (
    <div ref={raiz} className={cn("relative", className)}>
      <Boton variante="secundario" aria-haspopup="dialog" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(!abierto)}>
        <ListFilter className="size-4" aria-hidden />
        Filtros
        {activos > 0 && (
          <span aria-label={`${activos} activos`} className="mini inline-grid h-5 min-w-5 place-items-center rounded-pildora bg-carbon px-1 text-sobre-carbon">
            {activos}
          </span>
        )}
      </Boton>
      {abierto && (
        <div id={id} role="dialog" aria-label="Filtros" className="absolute right-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-3 shadow-menu">
          {children}
          {onLimpiar && (
            <Boton variante="fantasma" tamano="sm" disabled={activos === 0} onClick={onLimpiar} className="self-start">
              Quitar filtros
            </Boton>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Encabezado de página: título a la izquierda y las acciones a la derecha, en la misma línea.
   Una sola acción principal por vista; `insignias` va junto al título y `detalle` debajo. ── */
export function EncabezadoPagina({ titulo, insignias, detalle, children }: { titulo: string; insignias?: React.ReactNode; detalle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="titulo-pagina">{titulo}</h1>
          {insignias}
        </div>
        {detalle && <div className="meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-texto-suave">{detalle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
