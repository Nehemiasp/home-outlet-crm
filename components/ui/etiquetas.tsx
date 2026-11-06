import { Ban, Bot, Clock, Eye, FilePen, FlaskConical, Package, PackageCheck, Store, TimerOff, Truck, User, CircleCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

/* Los 6 tonos de etiqueta salen de los tokens (sección 4: Tag.color). */
export const tonos = {
  carbon: "bg-carbon text-sobre-carbon",
  naranja: "bg-naranja-suave text-naranja-texto",
  exito: "bg-exito-suave text-exito",
  aviso: "bg-aviso-suave text-aviso",
  error: "bg-error-suave text-error",
  gris: "bg-linea text-texto",
} as const;
export type Tono = keyof typeof tonos;

/* Paleta de estados (pulido de UI, 1.2): fondo tenue y texto oscuro. Ninguna insignia de estado es sólida. */
export const tonosEstado = {
  neutro: "bg-estado-neutro-fondo text-estado-neutro-texto",
  info: "bg-estado-info-fondo text-estado-info-texto",
  aviso: "bg-estado-aviso-fondo text-estado-aviso-texto",
  exito: "bg-estado-exito-fondo text-estado-exito-texto",
  peligro: "bg-estado-peligro-fondo text-estado-peligro-texto",
} as const;
export type TonoEstado = keyof typeof tonosEstado;

/** `tono` es para etiquetas de cliente; `estado` es para todo lo que comunica un estado. */
export function Insignia({ tono = "gris", estado, icono: Icono, children, className }: { tono?: Tono; estado?: TonoEstado; icono?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("mini inline-flex items-center gap-1 rounded-pildora h-5 px-2 whitespace-nowrap", estado ? tonosEstado[estado] : tonos[tono], className)}>
      {Icono && <Icono className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

/* ── Canal: el ícono lleva tooltip y nombre accesible; el nombre en texto solo va en la ficha y en los filtros ── */
const canales = {
  whatsapp: { nombre: "WhatsApp" },
  tiktok: { nombre: "TikTok" },
  instagram: { nombre: "Instagram" },
  facebook: { nombre: "Facebook" },
  simulado: { nombre: "Simulado" },
} as const;
export type Canal = keyof typeof canales;
export const nombreCanal = (c: Canal) => canales[c].nombre;

/* Logos de marca (Simple Icons, dominio público; las marcas son de sus dueños). Simulado conserva su ícono. */
const LOGOS = {
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
} as const;
const COLOR_LOGO: Record<Canal, string> = { whatsapp: "text-canal-whatsapp", instagram: "text-canal-instagram", facebook: "text-canal-facebook", tiktok: "text-canal-tiktok", simulado: "text-canal-otros" };

/** Logo de la marca del canal en su color (14 px por defecto). Decorativo: el nombre va al lado en texto. */
export function LogoCanal({ canal, tamano = 14, color }: { canal: Canal; tamano?: number; /** Clase de color distinta a la de la marca (por ejemplo, blanco sobre el círculo del avatar). */ color?: string }) {
  if (canal === "simulado") {
    return <FlaskConical aria-hidden width={tamano} height={tamano} className={cn("shrink-0", color ?? COLOR_LOGO.simulado)} />;
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={tamano} height={tamano} fill="currentColor" className={cn("shrink-0", color ?? COLOR_LOGO[canal])}>
      <path d={LOGOS[canal]} />
    </svg>
  );
}

/** Solo el logo de la marca (16 px) en su color, con tooltip y aria-label con el nombre del canal. */
export function IconoCanal({ canal, className }: { canal: Canal; className?: string }) {
  const nombre = canales[canal].nombre;
  return (
    <Tooltip texto={nombre} className={className}>
      <span role="img" aria-label={nombre} className="inline-grid size-5 place-items-center">
        <LogoCanal canal={canal} tamano={16} />
      </span>
    </Tooltip>
  );
}

/** Logo y nombre juntos, para la ficha del contacto. */
export function InsigniaCanal({ canal }: { canal: Canal }) {
  return (
    <Insignia estado="neutro" className="gap-1.5">
      <LogoCanal canal={canal} tamano={12} />
      {canales[canal].nombre}
    </Insignia>
  );
}

/** Opción de un `Selector` de canal: su logo y su nombre. */
export const opcionCanal = (c: Canal) => ({ valor: c, texto: canales[c].nombre, icono: <LogoCanal canal={c} tamano={16} /> });

/* ── Estado de conversación ── */
const estados = {
  abierta: { texto: "Abierta", tono: "exito" },
  pendiente: { texto: "Pendiente", tono: "aviso" },
  cerrada: { texto: "Cerrada", tono: "neutro" },
} as const;
export type EstadoConversacion = keyof typeof estados;

export function InsigniaConversacion({ estado }: { estado: EstadoConversacion }) {
  return <Insignia estado={estados[estado].tono}>{estados[estado].texto}</Insignia>;
}

/* ── Etiqueta de cliente ── */
/* Insignia neutra con un punto de color a la izquierda: ni sólida ni naranja, para no confundirse con un estado.
   El tono guardado «naranja» se dibuja con punto azul y «aviso» con punto rosa, porque ya son los colores de los avisos. */
const PUNTO_ETIQUETA: Record<Tono, string> = {
  carbon: "var(--etiqueta-carbon)",
  naranja: "var(--etiqueta-azul)",
  exito: "var(--etiqueta-verde)",
  aviso: "var(--etiqueta-rosa)",
  error: "var(--etiqueta-rojo)",
  gris: "var(--etiqueta-gris)",
};

export function InsigniaEtiqueta({ nombre, tono }: { nombre: string; tono: Tono }) {
  return (
    <span className={cn("mini inline-flex h-5 items-center gap-1 rounded-pildora px-2 whitespace-nowrap", tonosEstado.neutro)}>
      <span aria-hidden className="size-2 rounded-pildora" style={{ background: PUNTO_ETIQUETA[tono] }} />
      {nombre}
    </span>
  );
}

/* ── Quién atiende la conversación: asistente, a la espera de un asesor, o el asesor ── */
export function InsigniaAtencion({ atencion, asesor }: { atencion: "asistente" | "esperando" | "asesor" | "ninguna"; asesor?: string | null }) {
  if (atencion === "asistente") return <Insignia estado="info" icono={Bot}>Asistente</Insignia>;
  if (atencion === "esperando") return <Insignia estado="aviso" icono={Clock}>Esperando asesor</Insignia>;
  if (atencion === "asesor") return <Insignia estado="neutro" icono={User}>{asesor ?? "Asesor"}</Insignia>;
  return null;
}

/** Avatar del asistente: el ícono de robot sobre carbón. */
export function AvatarAsistente({ tamano = "sm" }: { tamano?: "sm" | "md" }) {
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-pildora bg-carbon text-naranja", tamano === "sm" ? "size-8" : "size-10")}>
      <Bot className="size-5" aria-hidden />
    </span>
  );
}

/* ── Existencia: "Sin existencia", "Quedan 2", "En existencia" ── */
export function InsigniaExistencia({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return <Insignia estado="peligro">Sin existencia</Insignia>;
  if (cantidad <= 3) return <Insignia estado="aviso">Quedan {cantidad}</Insignia>;
  return <Insignia estado="exito">En existencia</Insignia>;
}

/* ── Contador de no leídos ── */
export function ContadorNoLeidos({ cantidad, etiqueta, className }: { cantidad: number; etiqueta?: string; className?: string }) {
  if (cantidad <= 0) return null;
  return (
    <span
      aria-label={etiqueta ?? `${cantidad} sin leer`}
      className={cn("mini inline-grid h-5 min-w-5 place-items-center rounded-pildora bg-naranja px-1 text-carbon", className)}
    >
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}

/* ── Avatar con iniciales (el color sale del nombre, así no cambia entre recargas) ── */
const tonosAvatar: Tono[] = ["naranja", "exito", "aviso", "error", "gris"];

/* Avatares solo en 32 y 40 px. */
const TAMANO_AVATAR = { sm: "mini size-8", md: "meta size-10" } as const;

export function Avatar({ nombre, tamano = "md" }: { nombre: string; tamano?: "sm" | "md" }) {
  const partes = nombre.trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase();
  const suma = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-pildora", tonos[tonosAvatar[suma % tonosAvatar.length]!], TAMANO_AVATAR[tamano])}>
      {iniciales || "?"}
    </span>
  );
}

const FONDO_CANAL: Record<Canal, string> = {
  whatsapp: "bg-canal-whatsapp",
  tiktok: "bg-canal-tiktok",
  instagram: "bg-canal-instagram",
  facebook: "bg-canal-facebook",
  simulado: "bg-canal-otros",
};

/** Avatar con el canal como círculo de 18 px (color del canal, logo de la marca en blanco) en la esquina inferior derecha, con borde `superficie` de 2 px. */
export function AvatarConCanal({ nombre, canal, tamano = "md" }: { nombre: string; canal: Canal; tamano?: "sm" | "md" }) {
  const nombreDelCanal = canales[canal].nombre;
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar nombre={nombre} tamano={tamano} />
      <span
        role="img"
        aria-label={nombreDelCanal}
        title={nombreDelCanal}
        className={cn("absolute -right-1 -bottom-1 inline-grid size-[18px] place-items-center rounded-pildora border-2 border-superficie text-white", FONDO_CANAL[canal])}
      >
        <LogoCanal canal={canal} tamano={10} color="text-white" />
      </span>
    </span>
  );
}

/* ── Pedido: un solo componente para el estado; ninguna pantalla arma insignias a mano ── */
const ESTADO_PEDIDO = {
  borrador: ["neutro", "Borrador", FilePen],
  pendiente_pago: ["aviso", "Pendiente de pago", Clock],
  en_revision: ["aviso", "Pago en revisión", Eye],
  pagado: ["exito", "Pagado", CircleCheck],
  preparando: ["info", "Preparando", Package],
  listo_para_recoger: ["info", "Listo para recoger", Store],
  enviado: ["info", "Enviado", Truck],
  entregado: ["exito", "Entregado", PackageCheck],
  cancelado: ["peligro", "Cancelado", Ban],
  vencido: ["peligro", "Vencido", TimerOff],
} as const satisfies Record<string, readonly [TonoEstado, string, LucideIcon]>;
export type EstadoPedidoVista = keyof typeof ESTADO_PEDIDO;
export const textoEstadoPedido = (e: EstadoPedidoVista) => ESTADO_PEDIDO[e][1];

export function InsigniaEstado({ estado }: { estado: EstadoPedidoVista }) {
  const [tono, texto, icono] = ESTADO_PEDIDO[estado];
  return (
    <Insignia estado={tono} icono={icono}>
      {texto}
    </Insignia>
  );
}

const PAGO = {
  sin_pago: ["neutro", "Sin pago"],
  en_revision: ["aviso", "En revisión"],
  parcial: ["aviso", "Pago parcial"],
  pagado: ["exito", "Pagado"],
  rechazado: ["peligro", "Rechazado"],
} as const satisfies Record<string, readonly [TonoEstado, string]>;
export type EstadoPagoInsignia = keyof typeof PAGO;

export function InsigniaPago({ estado }: { estado: EstadoPagoInsignia }) {
  return <Insignia estado={PAGO[estado][0]}>{PAGO[estado][1]}</Insignia>;
}
