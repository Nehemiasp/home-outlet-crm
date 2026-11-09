"use client";

import { AlertCircle, Bot, Check, CheckCheck, Clock, FileText, Info, ImagePlus, Loader2, Package, Send, ShoppingBag, Sparkles, TriangleAlert, CircleCheck, OctagonAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn, formatQ } from "@/lib/utils";
import { Boton, BotonIcono, Interruptor } from "./form";
import { AvisoAccionable } from "./estructura";
import { Avatar, AvatarAsistente, ContadorNoLeidos, InsigniaAtencion, InsigniaEstado, LogoCanal, nombreCanal, type Canal, type EstadoPedidoVista, type TonoEstado } from "./etiquetas";

/* ── Estado de entrega ── */
export type Entrega = "enviando" | "enviado" | "entregado" | "leido" | "fallo";

const entregas = {
  enviando: { icono: Clock, texto: "Enviando", color: "text-texto-suave" },
  enviado: { icono: Check, texto: "Enviado", color: "text-texto-suave" },
  entregado: { icono: CheckCheck, texto: "Entregado", color: "text-texto-suave" },
  leido: { icono: CheckCheck, texto: "Leído", color: "text-exito" },
  fallo: { icono: AlertCircle, texto: "No se envió", color: "text-error" },
} as const;

export function EstadoEntrega({ estado }: { estado: Entrega }) {
  const { icono: Icono, texto, color } = entregas[estado];
  return (
    <span className={cn("inline-flex items-center gap-1", color)} title={texto}>
      <Icono className="size-4" aria-hidden />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

/* ── Item de la lista de conversaciones ── */
export function ItemConversacion({
  nombre,
  canal,
  ultimoMensaje,
  hora,
  noLeidos = 0,
  seleccionada,
  atencion,
  estado,
  asesor,
  asignados = 0,
  onClick,
}: {
  nombre: string;
  canal: Canal;
  ultimoMensaje: string;
  hora: string;
  noLeidos?: number;
  seleccionada?: boolean;
  /** Quién atiende: va en palabras en la tercera línea. «Esperando asesor» es la excepción: lleva insignia de aviso porque pide acción. */
  atencion?: "asistente" | "esperando" | "asesor" | "ninguna";
  estado?: "abierta" | "pendiente" | "cerrada";
  /** Nombre del asesor cuando atiende uno. */
  asesor?: string | null;
  /** Cuántas personas la atienden: con más de una, el número va junto al nombre de la principal. */
  asignados?: number;
  onClick?: () => void;
}) {
  const cerrada = estado === "cerrada";
  const esperando = !cerrada && atencion === "esperando";
  const textoAtencion = cerrada ? "Cerrada" : atencion === "asistente" ? "Atiende el asistente" : atencion === "asesor" ? `Atiende ${asesor ?? "un asesor"}` : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={seleccionada || undefined}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-linea p-3 text-left transition-colors duration-150 max-md:min-h-11",
        seleccionada ? "bg-naranja-suave shadow-[inset_3px_0_0_var(--naranja)]" : "bg-superficie hover:bg-fondo",
      )}
    >
      <Avatar nombre={nombre} tamano="md" />
      <span className="min-w-0">
        <span className="cuerpo-fuerte block truncate">{nombre}</span>
        <span className={cn("cuerpo block truncate", noLeidos > 0 ? "text-texto" : "text-texto-suave")}>{ultimoMensaje}</span>
        <span className="meta mt-0.5 flex min-w-0 items-center gap-1 text-texto-suave">
          <LogoCanal canal={canal} />
          <span className="truncate">
            {nombreCanal(canal)}
            {textoAtencion && ` · ${textoAtencion}`}
          </span>
          {!cerrada && atencion === "asesor" && asignados > 1 && (
            <span className="mini inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-pildora bg-linea px-1 text-texto" title={`${asignados} personas la atienden`}>
              <span aria-hidden>{asignados}</span>
              <span className="sr-only">{`, ${asignados} personas la atienden`}</span>
            </span>
          )}
          {esperando && <InsigniaAtencion atencion="esperando" />}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="meta text-texto-suave">{hora}</span>
        <ContadorNoLeidos cantidad={noLeidos} />
      </span>
    </button>
  );
}

/* ── Separador de fecha («Hoy», «Ayer», «3 nov»): texto meta sobre el fondo de la conversación ── */
export function SeparadorDia({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={texto}>
      <span aria-hidden className="h-px flex-1 bg-linea" />
      <span className="meta text-texto-suave">{texto}</span>
      <span aria-hidden className="h-px flex-1 bg-linea" />
    </div>
  );
}

/* ── Burbuja de mensaje ── */
export type TarjetaPedidoUI = {
  id: string;
  codigo: string;
  estado: EstadoPedidoVista;
  lineas: { nombre: string; cantidad: number; total: number }[];
  descuento: number;
  envio: string;
  total: number;
  cuentas: { banco: string; tipo: "monetaria" | "ahorro"; numero: string; titular: string }[];
  /** Cómo va a pagar el cliente. Con tarjeta o efectivo la tarjeta no lleva cuentas bancarias. Null en los pedidos anteriores. */
  formaPago?: "transferencia" | "deposito" | "efectivo_en_tienda" | "tarjeta" | "contra_entrega" | null;
  /** El enlace de pago abierto (solo con tarjeta). */
  enlace?: string | null;
};

/** Mensaje de sistema: centrado, `meta`, con ícono y tono según el evento. */
const SISTEMA: Record<TonoEstado, { icono: typeof Info; color: string }> = {
  neutro: { icono: Info, color: "text-estado-neutro-texto" },
  info: { icono: Bot, color: "text-estado-info-texto" },
  aviso: { icono: TriangleAlert, color: "text-estado-aviso-texto" },
  exito: { icono: CircleCheck, color: "text-estado-exito-texto" },
  peligro: { icono: OctagonAlert, color: "text-estado-peligro-texto" },
};

function TarjetaDePedido({ p }: { p: TarjetaPedidoUI }) {
  return (
    <div className="flex w-80 max-w-full flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="cuerpo-fuerte">Pedido {p.codigo}</p>
        <InsigniaEstado estado={p.estado} />
      </div>
      <ul className="flex flex-col gap-1">
        {p.lineas.map((l) => (
          <li key={l.nombre} className="cuerpo flex justify-between gap-3">
            <span className="min-w-0">
              {l.cantidad} × {l.nombre}
            </span>
            <span className="shrink-0 tabular-nums">{formatQ(l.total)}</span>
          </li>
        ))}
        {p.descuento > 0 && (
          <li className="cuerpo flex justify-between gap-3 text-texto-suave">
            <span>Descuento</span>
            <span className="tabular-nums">-{formatQ(p.descuento)}</span>
          </li>
        )}
      </ul>
      <p className="meta text-texto-suave">{p.envio}</p>
      <p className="cuerpo-fuerte flex justify-between gap-3 border-t border-linea pt-2">
        <span>Total</span>
        <span className="tabular-nums">{formatQ(p.total)}</span>
      </p>
      {p.formaPago === "tarjeta" && (
        <div>
          <p className="titulo-seccion mb-1 text-texto-suave">Pago con tarjeta</p>
          <p className="meta text-texto">El cliente paga con tarjeta de crédito o débito en un enlace seguro.</p>
          {p.enlace && (
            <a href={p.enlace} target="_blank" rel="noopener noreferrer" className="cuerpo-fuerte mt-1 inline-block text-texto underline underline-offset-2 hover:no-underline max-md:flex max-md:min-h-11 max-md:items-center">
              Abrir enlace de pago
            </a>
          )}
        </div>
      )}
      {p.formaPago === "efectivo_en_tienda" && (
        <div>
          <p className="titulo-seccion mb-1 text-texto-suave">Pago en efectivo</p>
          <p className="meta text-texto">El cliente paga en efectivo al recoger el pedido en la tienda.</p>
        </div>
      )}
      {p.formaPago === "contra_entrega" && (
        <div>
          <p className="titulo-seccion mb-1 text-texto-suave">Pago contra entrega</p>
          <p className="meta text-texto">El cliente paga al recibir el pedido.</p>
        </div>
      )}
      {p.cuentas.length > 0 && (
        <div>
          <p className="titulo-seccion mb-1 text-texto-suave">Cuentas para pagar</p>
          <ul className="flex flex-col gap-1">
            {p.cuentas.map((c) => (
              <li key={c.numero} className="meta text-texto">
                <strong>{c.banco}</strong> · {c.tipo === "ahorro" ? "Ahorro" : "Monetaria"} · {c.numero} · {c.titular}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`/pedidos/${p.id}`} className="cuerpo-fuerte text-texto underline underline-offset-2 hover:no-underline max-md:flex max-md:min-h-11 max-md:items-center">
        Ver pedido
      </Link>
    </div>
  );
}
/** Lo mismo que recibe el cliente: nombre, foto y precio. Sin existencia (Home Outlet no la promete; ver lib/canales/whatsapp.ts). */
export type ProductoTarjeta = { nombre: string; sku: string; precioCentavos: number; imagenUrl?: string };

type BurbujaProps = {
  tipo: "entrante" | "saliente" | "nota" | "producto" | "sistema";
  /** Solo en mensajes de sistema: color e ícono según lo que pasó. */
  tono?: TonoEstado;
  /** Si el mensaje es el resumen de un pedido, se dibuja como tarjeta. */
  pedido?: TarjetaPedidoUI | null;
  texto?: string;
  hora?: string;
  estado?: Entrega;
  autor?: string;
  producto?: ProductoTarjeta;
  imagenUrl?: string;
  /** Mensaje del asistente: lleva su avatar y la etiqueta "Asistente". */
  asistente?: boolean;
  /** Lo que consultó el asistente para responder. Solo lo ve el equipo. */
  consultas?: string[];
  onReintentar?: () => void;
  /** Botones propios del equipo debajo de la burbuja (por ejemplo «Registrar como comprobante»). */
  acciones?: React.ReactNode;
};

export function Burbuja({ tipo, tono = "neutro", pedido, texto, hora, estado, autor, producto, imagenUrl, asistente, consultas, onReintentar, acciones }: BurbujaProps) {
  if (tipo === "sistema") {
    const { icono: Icono, color } = SISTEMA[tono];
    return (
      <p className={cn("meta mx-auto my-2 flex max-w-3/4 items-center justify-center gap-1 text-center", color)}>
        <Icono className="size-4 shrink-0" aria-hidden />
        <span>{texto}</span>
      </p>
    );
  }

  const saliente = tipo === "saliente" || tipo === "producto";
  const pie = (
    <span className="meta mt-1 flex items-center justify-end gap-1 text-texto-suave">
      {autor && <span>{autor} ·</span>}
      {hora && <span>{hora}</span>}
      {saliente && estado && <EstadoEntrega estado={estado} />}
    </span>
  );

  return (
    <div className={cn("flex flex-col gap-1", saliente || tipo === "nota" ? "items-end" : "items-start")}>
      {asistente && (
        <span className="flex items-center gap-1">
          <AvatarAsistente />
          <span className="mini text-naranja-texto">Asistente</span>
        </span>
      )}
      <div
        className={cn(
          "max-w-3/4 rounded-burbuja break-words",
          tipo !== "producto" && !pedido && "px-4 py-2",
          tipo === "entrante" && "rounded-bl-campo border border-linea bg-superficie",
          tipo === "saliente" && !pedido && "rounded-br-campo bg-naranja-suave",
          tipo === "saliente" && pedido && "overflow-hidden rounded-br-campo border border-linea bg-superficie",
          tipo === "producto" && "w-72 overflow-hidden rounded-br-campo border border-linea bg-superficie",
          tipo === "nota" && "rounded-br-campo border border-dashed border-aviso bg-aviso-suave",
        )}
      >
        {tipo === "nota" && <p className="mini mb-1 text-aviso">Nota interna · solo la ve el equipo</p>}

        {pedido ? (
          <>
            <TarjetaDePedido p={pedido} />
            <div className="px-3 pb-2">{pie}</div>
          </>
        ) : tipo === "producto" && producto ? (
          <>
            {/* La foto va dentro de una caja de altura fija que la recorta: sin esto, una foto alta se desborda y tapa el nombre y el precio.
                `contain` muestra el producto completo (una foto de catálogo no debe cortarse). */}
            <div className="relative grid h-36 place-items-center overflow-hidden bg-fondo text-texto-suave">
              {producto.imagenUrl ? <img src={producto.imagenUrl} alt={producto.nombre} className="absolute inset-0 size-full object-contain p-2" /> : <Package className="size-8" aria-hidden />}
            </div>
            <div className="flex flex-col gap-1 p-3">
              <p className="cuerpo-fuerte">{producto.nombre}</p>
              <p className="meta text-texto-suave">SKU {producto.sku}</p>
              <p className="cuerpo-fuerte">{formatQ(producto.precioCentavos)}</p>
            </div>
            <div className="px-3 pb-2">{pie}</div>
          </>
        ) : (
          <>
            {imagenUrl && <img src={imagenUrl} alt="Imagen enviada en la conversación" className="mb-1 max-h-72 rounded-campo object-cover" />}
            {texto && <p className="cuerpo whitespace-pre-wrap">{texto}</p>}
            {pie}
          </>
        )}
      </div>
      {consultas && consultas.length > 0 && <p className="meta max-w-3/4 text-right text-texto-suave">{consultas.join(" · ")}</p>}
      {acciones}
      {estado === "fallo" && (
        <div className="flex items-center gap-2">
          <span className="meta text-error">No se envió</span>
          <Boton variante="fantasma" tamano="sm" onClick={onReintentar}>
            Reintentar
          </Boton>
        </div>
      )}
    </div>
  );
}

/* ── Compositor de mensajes ── */
export type RespuestaRapida = { atajo: string; texto: string };

export function Compositor({
  respuestasRapidas,
  onEnviar,
  onEnviarProducto,
  onAdjuntar,
  onSugerir,
  onEnviarPlantilla,
  aviso,
  bloqueadoMotivo,
  soloNotas = true,
}: {
  respuestasRapidas: RespuestaRapida[];
  /** Devolver false deja el texto escrito (por ejemplo, si el envío falló antes de empezar). */
  onEnviar: (texto: string, esNota: boolean) => Promise<boolean | void> | boolean | void;
  onEnviarProducto?: () => void;
  onAdjuntar?: () => void;
  /** Pide un borrador al asistente. Devuelve el texto, que se escribe en el cuadro sin enviarlo. */
  onSugerir?: () => Promise<string | null>;
  /** Abre las plantillas aprobadas del canal. Sin esto el botón se ve deshabilitado (el canal no tiene plantillas). */
  onEnviarPlantilla?: () => void;
  /** Ej.: "La ventana para responder vence en 2 h 15 min" */
  aviso?: string;
  /** Si existe, el compositor se bloquea y muestra este motivo. */
  bloqueadoMotivo?: string;
  /** Aun bloqueado, permite escribir notas internas (el cliente no las ve). Por defecto sí. */
  soloNotas?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [indice, setIndice] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);

  const sugerencias = /^\/\S*$/.test(texto) ? respuestasRapidas.filter((r) => r.atajo.startsWith(texto.toLowerCase())) : [];
  const bloqueado = !!bloqueadoMotivo;
  const puedeEscribir = !bloqueado || (!!soloNotas && nota);

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || !puedeEscribir || ocupado) return;
    setOcupado(true);
    const ok = await onEnviar(limpio, nota);
    setOcupado(false);
    if (ok !== false) setTexto("");
  };
  const elegir = (r: RespuestaRapida) => {
    setTexto(r.texto);
    setIndice(0);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugerencias.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIndice((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + sugerencias.length) % sugerencias.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        elegir(sugerencias[indice % sugerencias.length]!);
        return;
      }
      if (e.key === "Escape") {
        setTexto("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <div className="rounded-[inherit] border-t border-linea bg-superficie p-3">
      {bloqueado && (
        <AvisoAccionable
          tono="aviso"
          className="mb-2"
          accion={
            <Boton variante="secundario" tamano="sm" onClick={onEnviarPlantilla} disabled={!onEnviarPlantilla} title={onEnviarPlantilla ? undefined : "Este canal no tiene plantillas"}>
              <FileText className="size-4" aria-hidden />
              Enviar plantilla
            </Boton>
          }
        >
          {bloqueadoMotivo}
        </AvisoAccionable>
      )}
      {!bloqueado && aviso && (
        <p role="status" className="meta mb-2 flex items-center gap-1 text-aviso">
          <Clock className="size-4" aria-hidden />
          {aviso}
        </p>
      )}

      <div className="relative">
        {nota && <p className="meta mb-1 text-naranja-texto">Nota interna, el cliente no la ve</p>}
        {sugerencias.length > 0 && (
          <ul role="listbox" aria-label="Respuestas rápidas" className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-tarjeta border border-linea bg-superficie shadow-menu">
            {sugerencias.map((r, i) => (
              <li key={r.atajo} role="option" aria-selected={i === indice % sugerencias.length}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(r);
                  }}
                  className={cn("flex w-full cursor-pointer gap-3 px-3 py-2 text-left", i === indice % sugerencias.length ? "bg-naranja-suave" : "hover:bg-fondo")}
                >
                  <span className="cuerpo-fuerte shrink-0">{r.atajo}</span>
                  <span className="cuerpo truncate text-texto-suave">{r.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          aria-label={nota ? "Nota interna" : "Mensaje"}
          rows={2}
          value={texto}
          disabled={!puedeEscribir}
          onChange={(e) => {
            setTexto(e.target.value);
            setIndice(0);
          }}
          onKeyDown={alTeclear}
          placeholder={nota ? "Escriba una nota interna…" : bloqueado ? "Solo puede escribir notas internas" : "Escriba un mensaje o / para respuestas rápidas"}
          className={cn(
            "cuerpo w-full resize-none rounded-campo border p-3 disabled:cursor-not-allowed disabled:bg-fondo",
            nota ? "border-naranja-texto bg-naranja-suave" : "border-texto-suave hover:border-texto",
          )}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <BotonIcono lado="arriba" etiqueta="Enviar imagen" icono={ImagePlus} onClick={onAdjuntar} disabled={bloqueado || nota} />
        <BotonIcono lado="arriba" etiqueta="Enviar producto" icono={ShoppingBag} onClick={onEnviarProducto} disabled={bloqueado || nota} />
        {onSugerir && (
          <BotonIcono
            lado="arriba"
            etiqueta="Sugerir respuesta"
            icono={sugiriendo ? Loader2 : Sparkles}
            cargando={sugiriendo}
            disabled={bloqueado || nota || sugiriendo}
            onClick={async () => {
              setSugiriendo(true);
              const borrador = await onSugerir();
              setSugiriendo(false);
              if (borrador) setTexto(borrador);
            }}
          />
        )}
        <BotonIcono
          lado="arriba"
          etiqueta={onEnviarPlantilla ? "Enviar plantilla" : "Enviar plantilla (este canal no tiene)"}
          icono={FileText}
          onClick={onEnviarPlantilla}
          disabled={!onEnviarPlantilla || nota}
        />
        <div className="ml-auto flex items-center gap-2">
          <Interruptor etiqueta="Nota interna" activo={nota} onCambio={setNota} disabled={bloqueado && !soloNotas} />
          <Boton onClick={enviar} cargando={ocupado} disabled={!puedeEscribir || !texto.trim()}>
            <Send className="size-4" aria-hidden />
            {nota ? "Guardar nota" : "Enviar"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
