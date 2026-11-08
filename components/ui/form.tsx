"use client";

import { AlertCircle, Check, ChevronDown, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

/* ── Botón ──
   Un solo botón principal por vista. `peligro` (sólido) solo va en el modal de confirmación;
   para iniciar una acción destructiva se usa `peligro-contorno`. */
type BotonProps = React.ComponentProps<"button"> & {
  variante?: "principal" | "secundario" | "fantasma" | "peligro" | "peligro-contorno";
  tamano?: "md" | "sm";
  cargando?: boolean;
};

const variantes = {
  principal: "bg-naranja text-carbon hover:brightness-95 active:brightness-90",
  secundario: "bg-superficie text-texto border border-linea hover:bg-fondo active:bg-linea",
  fantasma: "bg-transparent text-texto hover:bg-linea active:bg-linea",
  peligro: "bg-error text-white hover:brightness-110 active:brightness-95",
  "peligro-contorno": "bg-superficie text-error border border-error hover:bg-error-suave active:bg-error-suave",
};

export function Boton({ variante = "principal", tamano = "md", cargando, disabled, className, children, ...props }: BotonProps) {
  return (
    <button
      type="button"
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(
        "cuerpo-fuerte inline-flex items-center justify-center gap-2 rounded-campo transition-colors duration-150 cursor-pointer",
        // Deshabilitado: texto-suave sobre fondo (5:1) con borde, igual en todas las variantes.
        "disabled:cursor-not-allowed disabled:border-linea disabled:bg-fondo disabled:text-texto-suave disabled:shadow-[inset_0_0_0_1px_var(--linea)]",
        tamano === "md" ? "h-10 px-4 max-md:min-h-11" : "h-8 px-3 max-md:min-h-11",
        variantes[variante],
        className,
      )}
      {...props}
    >
      {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ── Botón de ícono: cuadrado de 36 px, ícono de 20 px. El tooltip y el aria-label son obligatorios (`etiqueta`). ── */
export function BotonIcono({ etiqueta, icono: Icono, cargando, lado, className, ...props }: Omit<React.ComponentProps<"button">, "children" | "aria-label"> & { etiqueta: string; icono: LucideIcon; cargando?: boolean; lado?: "abajo" | "arriba" }) {
  return (
    <Tooltip texto={etiqueta} lado={lado}>
      <button
        type="button"
        aria-label={etiqueta}
        aria-busy={cargando || undefined}
        className={cn(
          "inline-grid size-9 cursor-pointer place-items-center rounded-campo text-texto transition-colors duration-150 max-md:size-11",
          "hover:bg-fondo active:bg-linea disabled:cursor-not-allowed disabled:bg-transparent disabled:text-texto-suave",
          className,
        )}
        {...props}
      >
        <Icono className={cn("size-5", cargando && "animate-spin")} aria-hidden />
      </button>
    </Tooltip>
  );
}

/* ── Control segmentado: dos o tres opciones en una sola pieza (flechas cambian de opción) ── */
export type OpcionSegmento<V extends string> = { valor: V; texto: string; icono?: LucideIcon };

/** `valor` puede ser null cuando ninguna opción aplica todavía (por ejemplo, una conversación que espera asesor). */
export function ControlSegmentado<V extends string>({ opciones, valor, onCambio, etiqueta, disabled }: { opciones: OpcionSegmento<V>[]; valor: V | null; onCambio: (v: V) => void; etiqueta: string; disabled?: boolean }) {
  const id = useId();
  const alTeclear = (e: React.KeyboardEvent, i: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const sig = opciones[(i + paso + opciones.length) % opciones.length]!;
    onCambio(sig.valor);
    document.getElementById(`${id}-${sig.valor}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex gap-0.5 rounded-campo border border-linea bg-fondo p-0.5">
      {opciones.map((o, i) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            id={`${id}-${o.valor}`}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa || (valor === null && i === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => !activa && onCambio(o.valor)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={cn(
              "meta inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-campo px-3 whitespace-nowrap transition-colors max-md:min-h-11",
              "disabled:cursor-not-allowed disabled:text-texto-suave",
              "border",
              activa ? "border-linea bg-superficie font-bold text-texto shadow-minima" : "border-transparent text-texto-suave hover:text-texto",
            )}
          >
            {o.icono && <o.icono className="size-4" aria-hidden />}
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

/* ── Envoltura de campo: etiqueta, ayuda y error ── */
type CampoBase = { etiqueta: string; ayuda?: string; error?: string; etiquetaOculta?: boolean };

function Envoltura({ id, etiqueta, etiquetaOculta, ayuda, error, children }: CampoBase & { id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cn("cuerpo-fuerte", etiquetaOculta && "sr-only")}>
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="meta flex items-center gap-1 text-error">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-msg`} className="meta text-texto-suave">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

const control =
  "w-full rounded-campo border bg-superficie px-3 cuerpo text-texto transition-colors disabled:cursor-not-allowed disabled:bg-fondo disabled:text-texto-suave";
const borde = (error?: string) => (error ? "border-error" : "border-texto-suave hover:border-texto");

/* ── Campo de texto ── */
export function CampoTexto({ etiqueta, ayuda, error, className, id, ...props }: CampoBase & React.ComponentProps<"input">) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <Envoltura id={cid} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input
        id={cid}
        aria-invalid={!!error || undefined}
        aria-describedby={error || ayuda ? `${cid}-msg` : undefined}
        className={cn(control, "h-10", borde(error), className)}
        {...props}
      />
    </Envoltura>
  );
}

/* ── Área de texto ── */
export function AreaTexto({ etiqueta, ayuda, error, className, id, ...props }: CampoBase & React.ComponentProps<"textarea">) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <Envoltura id={cid} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <textarea
        id={cid}
        aria-invalid={!!error || undefined}
        aria-describedby={error || ayuda ? `${cid}-msg` : undefined}
        className={cn(control, "min-h-24 py-2 resize-y", borde(error), className)}
        {...props}
      />
    </Envoltura>
  );
}

/* ── Selector: lista propia (no la nativa del sistema) con teclado completo ──
   Flechas ↑↓ mueven, Inicio y Fin saltan, Enter o Espacio eligen, Escape cierra,
   y al escribir una letra salta a la opción que empieza con ella. */
export type OpcionSelector = { valor: string; texto: string; deshabilitada?: boolean; /** Adorno a la izquierda del texto (por ejemplo, el logo de un canal). */ icono?: React.ReactNode };

export function Selector({
  etiqueta,
  etiquetaOculta,
  ayuda,
  error,
  opciones,
  value,
  defaultValue = "",
  onCambio,
  placeholder = "Elegir…",
  name,
  disabled,
  className,
  id,
}: CampoBase & {
  opciones: OpcionSelector[];
  value?: string;
  defaultValue?: string;
  onCambio?: (valor: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const auto = useId();
  const cid = id ?? auto;
  const [interno, setInterno] = useState(defaultValue);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  // La lista va con posición fija (calculada desde el campo) para que no la recorte una ventana ni un panel con desplazamiento.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const valor = value ?? interno;
  const elegida = opciones.find((o) => o.valor === valor);
  const habilitada = (i: number) => !!opciones[i] && !opciones[i].deshabilitada;

  const mover = (desde: number, paso: 1 | -1) => {
    for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso) if (habilitada(i)) return i;
    return desde;
  };
  const abrir = () => {
    const r = caja.current?.getBoundingClientRect();
    if (r) {
      const abajo = window.innerHeight - r.bottom - 12;
      const arriba = r.top - 12;
      const haciaArriba = abajo < 200 && arriba > abajo; // casi no cabe hacia abajo: se abre hacia arriba
      setPos({ left: r.left, width: r.width, maxHeight: Math.max(120, Math.min(288, haciaArriba ? arriba : abajo)), ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    }
    const i = opciones.findIndex((o) => o.valor === valor);
    setActivo(i >= 0 ? i : mover(-1, 1));
    setAbierto(true);
  };
  const elegir = (i: number) => {
    const o = opciones[i];
    if (!o || o.deshabilitada) return;
    setInterno(o.valor);
    onCambio?.(o.valor);
    setAbierto(false);
  };

  // Si la página o la ventana se desplaza (no la propia lista) o cambia de tamaño, se cierra: la lista ya no estaría pegada al campo.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: Event) => !lista.current?.contains(e.target as Node) && setAbierto(false);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (!abierto) return abrir();
        return setActivo(mover(activo, e.key === "ArrowDown" ? 1 : -1));
      case "Home":
      case "End":
        e.preventDefault();
        if (!abierto) return abrir();
        return setActivo(e.key === "Home" ? mover(-1, 1) : mover(opciones.length, -1));
      case "Enter":
      case " ":
        e.preventDefault();
        return abierto ? elegir(activo) : abrir();
      case "Escape":
        if (abierto) {
          e.preventDefault();
          setAbierto(false);
        }
        return;
      case "Tab":
        return setAbierto(false);
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const letra = e.key.toLowerCase();
      const orden = [...opciones.keys()];
      const desde = orden.slice(activo + 1).concat(orden.slice(0, activo + 1));
      const i = desde.find((j) => habilitada(j) && opciones[j]!.texto.toLowerCase().startsWith(letra));
      if (i !== undefined) {
        if (abierto) setActivo(i);
        else elegir(i);
      }
    }
  };

  return (
    <Envoltura id={cid} etiqueta={etiqueta} etiquetaOculta={etiquetaOculta} ayuda={ayuda} error={error}>
      <div ref={caja} className="relative">
        <button
          id={cid}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-controls={`${cid}-lista`}
          aria-activedescendant={abierto && activo >= 0 ? `${cid}-op-${activo}` : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={error || ayuda ? `${cid}-msg` : undefined}
          disabled={disabled}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          onKeyDown={alTeclear}
          onBlur={() => setAbierto(false)}
          className={cn(control, "flex h-10 cursor-pointer items-center justify-between gap-2 text-left", borde(error), className)}
        >
          <span className={cn("flex min-w-0 items-center gap-2", !elegida && "text-texto-suave")}>
            {elegida?.icono}
            <span className="truncate">{elegida?.texto ?? placeholder}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-texto-suave transition-transform duration-150", abierto && "rotate-180")} aria-hidden />
        </button>
        {name && <input type="hidden" name={name} value={valor} />}
        {abierto && pos && (
          <ul
            ref={lista}
            id={`${cid}-lista`}
            role="listbox"
            aria-label={etiqueta}
            onMouseDown={(e) => e.preventDefault()}
            style={pos}
            className="fixed z-50 overflow-y-auto rounded-tarjeta border border-linea bg-superficie py-1 shadow-menu"
          >
            {opciones.map((o, i) => (
              <li
                key={o.valor}
                id={`${cid}-op-${i}`}
                role="option"
                aria-selected={o.valor === valor}
                aria-disabled={o.deshabilitada || undefined}
                onMouseMove={() => habilitada(i) && setActivo(i)}
                onClick={() => elegir(i)}
                className={cn(
                  "cuerpo flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 max-md:min-h-11",
                  i === activo && "bg-naranja-suave",
                  o.valor === valor && "cuerpo-fuerte",
                  o.deshabilitada && "cursor-not-allowed text-texto-suave",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {o.icono}
                  {o.texto}
                </span>
                {o.valor === valor && <Check className="size-4 shrink-0" aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Envoltura>
  );
}

/* ── Casilla ── */
export function Casilla({ etiqueta, className, ...props }: { etiqueta: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <label className={cn("cuerpo inline-flex min-h-10 cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed has-disabled:opacity-50", className)}>
      <input type="checkbox" className="size-5 cursor-pointer disabled:cursor-not-allowed" {...props} />
      {etiqueta}
    </label>
  );
}

/* ── Grupo de casillas: varias opciones de una lista larga (con desplazamiento), por ejemplo los departamentos de una zona ── */
export function GrupoCasillas({ etiqueta, ayuda, opciones, valores, onCambio, vacio = "No hay opciones.", className }: { etiqueta: string; ayuda?: string; opciones: { valor: string; texto: string }[]; valores: string[]; onCambio: (valores: string[]) => void; vacio?: string; className?: string }) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-1", className)}>
      <legend className="cuerpo-fuerte mb-1">{etiqueta}</legend>
      {ayuda && <p className="meta text-texto-suave">{ayuda}</p>}
      {opciones.length === 0 ? (
        <p className="meta rounded-campo bg-fondo p-3 text-texto-suave">{vacio}</p>
      ) : (
        <div className="grid max-h-48 gap-x-3 overflow-y-auto rounded-campo border border-linea p-2 sm:grid-cols-2">
          {opciones.map((o) => (
            <Casilla key={o.valor} etiqueta={o.texto} checked={valores.includes(o.valor)} onChange={(e) => onCambio(e.target.checked ? [...valores, o.valor] : valores.filter((v) => v !== o.valor))} />
          ))}
        </div>
      )}
    </fieldset>
  );
}

/* ── Interruptor ── */
export function Interruptor({
  etiqueta,
  activo,
  onCambio,
  disabled,
  etiquetaOculta,
}: {
  etiqueta: string;
  activo: boolean;
  onCambio: (activo: boolean) => void;
  disabled?: boolean;
  /** La etiqueta solo la lee el lector de pantalla (por ejemplo, un interruptor dentro de una tabla). */
  etiquetaOculta?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={disabled}
      onClick={() => onCambio(!activo)}
      className="cuerpo inline-flex min-h-10 items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={cn("relative h-6 w-10 shrink-0 rounded-pildora transition-colors duration-150", activo ? "bg-carbon" : "bg-texto-suave")}>
        <span className={cn("absolute top-1 left-1 size-4 rounded-pildora bg-white transition-transform duration-150", activo && "translate-x-4")} />
      </span>
      <span className={etiquetaOculta ? "sr-only" : undefined}>{etiqueta}</span>
    </button>
  );
}

/* ── Buscador ── */
export function Buscador({
  valor,
  onCambio,
  etiqueta = "Buscar",
  placeholder = "Buscar…",
  className,
  autoFocus,
}: {
  valor: string;
  onCambio: (valor: string) => void;
  etiqueta?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-3 left-3 size-4 text-texto-suave" aria-hidden />
      <input
        type="search"
        autoFocus={autoFocus}
        aria-label={etiqueta}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className={cn(control, "h-10 pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden", borde())}
      />
      {valor && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onCambio("")}
          className="absolute top-0 right-0 grid size-10 cursor-pointer place-items-center rounded-campo text-texto-suave hover:text-texto"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
