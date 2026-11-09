"use client";

import { FileText, ImagePlus, Inbox, Plus, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Burbuja, Compositor, EstadoEntrega, ItemConversacion, SeparadorDia, type Entrega } from "@/components/ui/conversacion";
import { EstadoVacio, Esqueleto, EsqueletoConversacion } from "@/components/ui/estados";
import { Avatar, AvatarAsistente, AvatarConCanal, ContadorNoLeidos, IconoCanal, Insignia, InsigniaAtencion, InsigniaCanal, InsigniaConversacion, InsigniaEstado, InsigniaEtiqueta, InsigniaExistencia, InsigniaPago, LogoCanal, nombreCanal, tonos, tonosEstado, type Tono, type TonoEstado } from "@/components/ui/etiquetas";
import { ListaCompras } from "@/components/ui/pedidos";
import { AvisoInactividad, CodigosRespaldo, QrSegundoFactor } from "@/components/ui/seguridad";
import { AreaTexto, Boton, BotonIcono, Buscador, CampoTexto, Casilla, ControlSegmentado, GrupoCasillas, Interruptor, Selector } from "@/components/ui/form";
import { ControlDisponibilidad, InsigniaDisponibilidad, ModalPausaLarga } from "@/components/ui/disponibilidad";
import { ModalAsignar, ModalDevolver, ResumenEquipo, TablaEquipo } from "@/components/ui/equipo";
import { ModalPlantillas } from "@/components/ui/plantillas";
import { AvisoAccionable, BotonFiltros, EncabezadoPagina, enlaceTabla, LineaDePasos, MenuDesplegable, Modal, PanelLateral, PestanasConContador, Tabla, type Columna, type Orden } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { BarrasApiladas, BarrasHorizontales, COLOR_CANAL, LineaAcumulada, TarjetaKPI } from "@/components/ui/graficas";
import { CeldaExistencia, FotoProducto } from "@/app/(app)/catalogo/existencias";
import { formatQ, formatTelefono } from "@/lib/utils";

const colores = [
  ["carbon", "#2E2C2D", "Barra lateral, texto principal, encabezados", "bg-carbon"],
  ["carbon-soft", "#3A3839", "Hover y activos sobre carbon", "bg-carbon-soft"],
  ["naranja", "#FF9400", "Botón principal, indicador activo. Nunca texto sobre blanco (2.2:1)", "bg-naranja"],
  ["naranja-texto", "#A85800", "Enlaces y texto destacado sobre claro (5.2:1)", "bg-naranja-texto"],
  ["naranja-suave", "#FFF1DC", "Seleccionados y avisos de marca", "bg-naranja-suave"],
  ["fondo", "#F6F5F4", "Fondo general", "bg-fondo"],
  ["superficie", "#FFFFFF", "Tarjetas, paneles, burbujas entrantes", "bg-superficie"],
  ["linea", "#E4E2E1", "Bordes y divisores de 1 px", "bg-linea"],
  ["texto-suave", "#6B6869", "Texto secundario y metadatos (5:1)", "bg-texto-suave"],
  ["exito", "#1F7A4D", "Enviado, en existencia", "bg-exito"],
  ["aviso", "#9A5B00", "Ventana por vencer, existencia baja", "bg-aviso"],
  ["error", "#C0362C", "Error de envío, sin existencia", "bg-error"],
  ["exito-suave", "#E4F3EA", "Fondo de insignia de éxito", "bg-exito-suave"],
  ["aviso-suave", "#FBEFD5", "Fondo de insignia y avisos", "bg-aviso-suave"],
  ["error-suave", "#FBE7E5", "Fondo de insignia de error", "bg-error-suave"],
] as const;

const estados = [
  ["neutro", "#EFEDEC", "#4A4748", "Borrador, cerrada, sin asignar"],
  ["info", "#E6EEF8", "#1F4E8C", "Preparando, enviado, listo para recoger, asistente atendiendo"],
  ["aviso", "#FFF1DC", "#8A4E00", "Pendiente de pago, en revisión, esperando asesor, quedan pocas existencias"],
  ["exito", "#E3F3EA", "#1F7A4D", "Pagado, entregado, en existencia"],
  ["peligro", "#FBE7E5", "#B0302A", "Vencido, cancelado, pago rechazado, sin existencia"],
] as const satisfies readonly (readonly [TonoEstado, string, string, string])[];

const coloresCanal = [
  ["whatsapp", "WhatsApp", "#1F7A4D"],
  ["tiktok", "TikTok", "#2E2C2D"],
  ["instagram", "Instagram", "#B5487A"],
  ["facebook", "Facebook", "#3B6FB6"],
  ["otros", "Otros (y Simulado, solo en desarrollo)", "#8A8687"],
] as const;

/** Contraste WCAG entre dos colores #RRGGBB. */
function contraste(a: string, b: string) {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return ((x! + 0.05) / (y! + 0.05)).toFixed(1);
}

const estilosTexto = [
  ["titulo-pagina", "24 / 32 · Montserrat 700", "Título de cada sección"],
  ["titulo-panel", "18 / 26 · Nunito 700", "Encabezado de paneles y modales"],
  ["cuerpo", "15 / 22 · Nunito 400", "Mensajes, formularios, tablas"],
  ["cuerpo-fuerte", "15 / 22 · Nunito 700", "Nombres de contacto, etiquetas de campo"],
  ["meta", "13 / 18 · Nunito 600", "Hora, canal, estado"],
  ["mini", "12 / 16 · Nunito 700", "Insignias y contadores"],
] as const;

const productos = [
  { sku: "HG-001", nombre: "Licuadora de vidrio 1.5 L", precio: 34900, existencia: 12 },
  { sku: "HG-002", nombre: "Set de ollas antiadherentes", precio: 89900, existencia: 3 },
  { sku: "EL-001", nombre: "Pantalla para carro 9 pulgadas", precio: 125000, existencia: 0 },
  { sku: "EL-002", nombre: "Bocina bluetooth portátil", precio: 24900, existencia: 8 },
  { sku: "AC-001", nombre: "Cubreasientos universal", precio: 19900, existencia: 2 },
  { sku: "AC-002", nombre: "Organizador de maletero", precio: 12900, existencia: 15 },
  { sku: "HG-003", nombre: "Organizador de cocina", precio: 8900, existencia: 20 },
];
type Producto = (typeof productos)[number];

const columnas: Columna<Producto>[] = [
  { clave: "nombre", titulo: "Producto", ordenable: true, render: (p) => <a href="#estructura" className={enlaceTabla}>{p.nombre}</a> },
  { clave: "sku", titulo: "SKU", render: (p) => <span className="whitespace-nowrap">{p.sku}</span> },
  { clave: "precio", titulo: "Precio", ordenable: true, alinear: "der", render: (p) => formatQ(p.precio) },
  { clave: "existencia", titulo: "Existencia", render: (p) => <InsigniaExistencia cantidad={p.existencia} /> },
];

const ESTADOS_INTERACCION = ["Normal", "Hover", "Foco", "Activo", "Deshabilitado"];
const FOCO: CSSProperties = { outline: "2px solid var(--carbon)", outlineOffset: "2px", boxShadow: "0 0 0 2px var(--naranja)" };
/* Estados forzados solo para mostrarlos juntos; en la aplicación los dan :hover, :focus-visible y :active. */
const FORZADO: Record<"principal" | "secundario" | "fantasma" | "peligro-contorno" | "icono" | "enlace", Record<string, CSSProperties | undefined>> = {
  principal: { normal: undefined, hover: { filter: "brightness(0.95)" }, foco: FOCO, activo: { filter: "brightness(0.9)" } },
  secundario: { normal: undefined, hover: { background: "var(--fondo)" }, foco: FOCO, activo: { background: "var(--linea)" } },
  fantasma: { normal: undefined, hover: { background: "var(--linea)" }, foco: FOCO, activo: { background: "var(--linea)" } },
  "peligro-contorno": { normal: undefined, hover: { background: "var(--error-suave)" }, foco: FOCO, activo: { background: "var(--error-suave)" } },
  icono: { normal: undefined, hover: { background: "var(--fondo)" }, foco: FOCO, activo: { background: "var(--linea)" } },
  enlace: { normal: undefined, hover: { textDecoration: "underline" }, foco: FOCO },
};

const PASOS = ["Pendiente de pago", "Pago verificado", "Preparando", "Enviado", "Entregado"];

const respuestasRapidas = [
  { atajo: "/horario", texto: "[Horario de atención: pendiente de confirmar]" },
  { atajo: "/ubicacion", texto: "[Dirección del local: pendiente de confirmar]" },
  { atajo: "/envios", texto: "[Información de envíos: pendiente de confirmar]" },
];

/** Un cuadro gris de ejemplo (GIF de 1 píxel): en la pantalla real el QR lo genera el servidor. */
const QR_DE_EJEMPLO = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-4 py-8">
      <h2 id={`${id}-t`} className="titulo-pagina mb-4">
        {titulo}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-tarjeta border border-linea bg-superficie p-4">
      <h3 className="meta mb-3 text-texto-suave">{titulo}</h3>
      {children}
    </div>
  );
}

const secciones = [
  ["color", "Color"],
  ["tipografia", "Tipografía"],
  ["espacio", "Espacio y bordes"],
  ["acciones", "Botones"],
  ["formularios", "Formularios"],
  ["etiquetas", "Etiquetas"],
  ["conversacion", "Conversación"],
  ["estructura", "Estructura"],
  ["estados", "Carga y vacío"],
  ["seguridad", "Seguridad"],
  ["asistente", "Asistente"],
  ["graficas", "Gráficas"],
];

export function Guia() {
  const avisar = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [pestana, setPestana] = useState("sin-asignar");
  const [interruptor, setInterruptor] = useState(true);
  const [zonasMarcadas, setZonasMarcadas] = useState<string[]>(["Izabal"]);
  const [modal, setModal] = useState(false);
  const [panel, setPanel] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [seleccionada, setSeleccionada] = useState(0);
  const [atiende, setAtiende] = useState<"asistente" | "asesor">("asistente");
  const [rango, setRango] = useState<"7" | "30" | "90">("30");
  const [cargando, setCargando] = useState(false);
  const [pausaLarga, setPausaLarga] = useState(false);
  const [inactividad, setInactividad] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [asignar, setAsignar] = useState(false);
  const [plantillas, setPlantillas] = useState(false);

  const filas = useMemo(() => {
    const copia = [...productos];
    if (orden) {
      const k = orden.clave as "nombre" | "precio";
      copia.sort((a, b) => (a[k] > b[k] ? 1 : -1) * (orden.dir === "asc" ? 1 : -1));
    }
    return copia;
  }, [orden]);
  const porPagina = 4;
  const totalPaginas = Math.ceil(filas.length / porPagina);

  const ordenar = (clave: string) => setOrden((o) => (o?.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: "asc" }));
  const simularCarga = () => {
    setCargando(true);
    setTimeout(() => setCargando(false), 1800);
  };

  return (
    <>
      <header className="border-b border-linea bg-superficie">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <h1 className="titulo-pagina">Sistema de diseño</h1>
        </div>
        <nav aria-label="Secciones de la guía">
          <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
            {secciones.map(([id, texto]) => (
              <li key={id}>
                <a href={`#${id}`} className="meta inline-flex h-8 items-center rounded-campo px-3 whitespace-nowrap text-texto-suave hover:bg-fondo hover:text-texto max-md:min-h-11">
                  {texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-12">
        <p className="cuerpo mt-6 max-w-2xl text-texto-suave">
          Tokens y componentes de la fase 1, con los ajustes del pulido de interfaz (estados, canales, botones de ícono, control segmentado, línea de pasos, avisos y tarjetas KPI). Todos los datos de esta página son ficticios. Pase el cursor y use la tecla Tab para ver los estados de hover y foco.
        </p>

        <Seccion id="color" titulo="Color">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colores.map(([nombre, hex, uso, clase]) => (
              <div key={nombre} className="flex gap-3 rounded-tarjeta border border-linea bg-superficie p-3">
                <span aria-hidden className={`size-12 shrink-0 rounded-campo border border-linea ${clase}`} />
                <div>
                  <p className="cuerpo-fuerte">{nombre}</p>
                  <p className="meta text-texto-suave">{hex}</p>
                  <p className="meta mt-1 text-texto-suave">{uso}</p>
                </div>
              </div>
            ))}
          </div>
          <Bloque titulo="Paleta de estados · fondo tenue, texto oscuro e ícono. Ninguna insignia de estado es sólida">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {estados.map(([tono, fondo, texto, uso]) => (
                <li key={tono} className="flex flex-col gap-2 rounded-tarjeta border border-linea p-3">
                  <Insignia estado={tono}>estado-{tono}</Insignia>
                  <p className="meta text-texto-suave">
                    Fondo {fondo} · texto {texto} · contraste {contraste(fondo, texto)}:1
                  </p>
                  <p className="meta">{uso}</p>
                </li>
              ))}
            </ul>
          </Bloque>
          <Bloque titulo="Color de cada canal en las gráficas · igual en todas las gráficas y leyendas">
            <ul className="flex flex-wrap gap-4">
              {coloresCanal.map(([id, nombre, hex]) => (
                <li key={id} className="flex items-center gap-2">
                  <span aria-hidden className="size-6 rounded-campo border border-linea" style={{ background: hex }} />
                  <span className="meta">
                    {nombre} · {hex} · {contraste("#FFFFFF", hex)}:1 sobre blanco
                  </span>
                </li>
              ))}
            </ul>
          </Bloque>
          <Bloque titulo="Etiquetas de cliente · insignia neutra con un punto de color; nunca sólida ni naranja, para no confundirse con un estado">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(tonos) as Tono[]).map((t) => (
                <InsigniaEtiqueta key={t} nombre={t} tono={t} />
              ))}
            </div>
            <p className="meta mt-3 text-texto-suave">El tono guardado «naranja» se dibuja con punto azul y «aviso» con punto rosa, porque esos colores ya son los de los avisos.</p>
          </Bloque>
        </Seccion>

        <Seccion id="tipografia" titulo="Tipografía">
          <div className="divide-y divide-linea rounded-tarjeta border border-linea bg-superficie">
            {estilosTexto.map(([clase, medida, uso]) => (
              <div key={clase} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <p className={clase}>Home Outlet · Q1,250.00 · 5555 1234</p>
                <p className="meta text-texto-suave">
                  {clase} · {medida} · {uso}
                </p>
              </div>
            ))}
          </div>
          <Bloque titulo="Formato de datos">
            <p className="cuerpo">
              Dinero: <span className="cuerpo-fuerte">{formatQ(125000)}</span> (guardado como 125000 centavos). Teléfono: <span className="cuerpo-fuerte">{formatTelefono("+50255550001")}</span> (guardado como +50255550001).
            </p>
          </Bloque>
        </Seccion>

        <Seccion id="espacio" titulo="Espacio y bordes">
          <Bloque titulo="Escala de 4 px: 4, 8, 12, 16, 24, 32, 48">
            <div className="flex flex-wrap items-end gap-4">
              {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                <div key={n} className="flex flex-col items-center gap-1">
                  <span className="bg-naranja" style={{ width: n * 4, height: n * 4 }} />
                  <span className="meta text-texto-suave">{n * 4}</span>
                </div>
              ))}
            </div>
          </Bloque>
          <Bloque titulo="Radios: 6 botones y campos · 10 tarjetas y paneles · 16 burbujas · 999 insignias y avatares">
            <div className="flex flex-wrap gap-4">
              {[
                ["campo", "rounded-campo"],
                ["tarjeta", "rounded-tarjeta"],
                ["burbuja", "rounded-burbuja"],
                ["pildora", "rounded-pildora"],
              ].map(([n, c]) => (
                <span key={n} className={`meta grid h-12 w-24 place-items-center border border-texto-suave bg-fondo ${c}`}>
                  {n}
                </span>
              ))}
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="acciones" titulo="Botones">
          <Bloque titulo="Variantes · tamaño md (40 px)">
            <div className="flex flex-wrap gap-3">
              <Boton>Enviar</Boton>
              <Boton variante="secundario">Asignar</Boton>
              <Boton variante="fantasma">Ver ficha</Boton>
              <Boton variante="peligro-contorno">
                <Trash2 className="size-4" aria-hidden />
                Cancelar pedido
              </Boton>
              <Boton variante="peligro">Sí, cancelar pedido</Boton>
            </div>
            <p className="meta mt-3 text-texto-suave">Un solo botón principal por vista. «Peligro» sólido solo va en el modal de confirmación; para iniciar la acción se usa «peligro-contorno».</p>
          </Bloque>
          <Bloque titulo="Botón de ícono · 36 px, ícono de 20 px, tooltip y nombre accesible obligatorios (pase el cursor o use Tab)">
            <div className="flex flex-wrap items-center gap-3">
              <BotonIcono etiqueta="Enviar imagen" icono={ImagePlus} />
              <BotonIcono etiqueta="Enviar producto" icono={ShoppingBag} />
              <BotonIcono etiqueta="Sugerir respuesta" icono={Sparkles} />
              <BotonIcono etiqueta="Enviar plantilla" icono={FileText} />
              <BotonIcono etiqueta="Enviar plantilla (no disponible)" icono={FileText} disabled />
            </div>
          </Bloque>
          <Bloque titulo="Estados de interacción · normal, hover, foco, activo y deshabilitado (el hover y el foco también funcionan en vivo con el cursor y la tecla Tab)">
            <div className="overflow-x-auto">
              <table className="cuerpo w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="meta px-2 py-2 text-texto-suave">Componente</th>
                    {ESTADOS_INTERACCION.map((e) => (
                      <th key={e} scope="col" className="meta px-2 py-2 text-texto-suave">{e}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([["principal", "Principal"], ["secundario", "Secundario"], ["fantasma", "Fantasma"], ["peligro-contorno", "Peligro contorno"]] as const).map(([v, nombre]) => (
                    <tr key={v} className="border-t border-linea">
                      <th scope="row" className="cuerpo-fuerte px-2 py-3 text-left">{nombre}</th>
                      {(["normal", "hover", "foco", "activo"] as const).map((e) => (
                        <td key={e} className="px-3 py-3">
                          <Boton variante={v} tamano="sm" style={FORZADO[v][e]}>Asignar</Boton>
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <Boton variante={v} tamano="sm" disabled>Asignar</Boton>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-linea">
                    <th scope="row" className="cuerpo-fuerte px-2 py-3 text-left">Botón de ícono</th>
                    {(["normal", "hover", "foco", "activo"] as const).map((e) => (
                      <td key={e} className="px-3 py-3">
                        <BotonIcono etiqueta="Enviar producto" icono={ShoppingBag} style={FORZADO.icono[e]} />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <BotonIcono etiqueta="Enviar producto (no disponible)" icono={ShoppingBag} disabled />
                    </td>
                  </tr>
                  <tr className="border-t border-linea">
                    <th scope="row" className="cuerpo-fuerte px-2 py-3 text-left">Enlace de tabla</th>
                    {(["normal", "hover", "foco"] as const).map((e) => (
                      <td key={e} className="px-3 py-3">
                        <a href="#acciones" className={enlaceTabla} style={FORZADO.enlace[e]}>HO-000123</a>
                      </td>
                    ))}
                    <td className="meta px-3 py-3 text-texto-suave">Sin activo</td>
                    <td className="meta px-3 py-3 text-texto-suave">Sin deshabilitado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Bloque>
          <Bloque titulo="Tamaño sm (32 px)">
            <div className="flex flex-wrap gap-3">
              <Boton tamano="sm">Enviar</Boton>
              <Boton tamano="sm" variante="secundario">
                Asignar
              </Boton>
              <Boton tamano="sm" variante="fantasma">
                Ver ficha
              </Boton>
              <Boton tamano="sm" variante="peligro-contorno">
                Cerrar
              </Boton>
            </div>
          </Bloque>
          <Bloque titulo="Deshabilitado y cargando">
            <div className="flex flex-wrap gap-3">
              <Boton disabled>Enviar</Boton>
              <Boton variante="secundario" disabled>
                Asignar
              </Boton>
              <Boton variante="peligro-contorno" disabled>
                Cerrar conversación
              </Boton>
              <Boton cargando={cargando} onClick={simularCarga}>
                {cargando ? "Enviando" : "Probar carga"}
              </Boton>
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="formularios" titulo="Formularios">
          <div className="grid gap-6 md:grid-cols-2">
            <Bloque titulo="Campo de texto">
              <div className="flex flex-col gap-4">
                <CampoTexto etiqueta="Nombre" placeholder="Ana Pérez (ficticio)" />
                <CampoTexto etiqueta="Teléfono" type="tel" ayuda="Número de Guatemala, 8 dígitos." defaultValue="5555 0001" />
                <CampoTexto etiqueta="Correo" type="email" error="Escriba un correo con este formato: nombre@ejemplo.com" defaultValue="ana@" />
                <CampoTexto etiqueta="SKU" disabled defaultValue="HG-001" />
              </div>
            </Bloque>
            <Bloque titulo="Área de texto, selector, casilla, interruptor">
              <div className="flex flex-col gap-4">
                <AreaTexto etiqueta="Notas del cliente" placeholder="Escriba una nota" />
                <Selector
                  etiqueta="Estado"
                  defaultValue="abierta"
                  opciones={[
                    { valor: "abierta", texto: "Abierta" },
                    { valor: "pendiente", texto: "Pendiente" },
                    { valor: "cerrada", texto: "Cerrada" },
                  ]}
                />
                <Selector
                  etiqueta="Categoría"
                  error="Elija una categoría"
                  opciones={[
                    { valor: "hogar", texto: "Hogar" },
                    { valor: "electronica", texto: "Electrónica" },
                    { valor: "carro", texto: "Accesorios para carro" },
                  ]}
                />
                <div className="flex flex-wrap gap-6">
                  <Casilla etiqueta="Producto activo" defaultChecked />
                  <Casilla etiqueta="Deshabilitada" disabled />
                </div>
                <GrupoCasillas
                  etiqueta="Departamentos que cubre la zona"
                  ayuda="Varias opciones de una lista larga, con desplazamiento."
                  opciones={["Guatemala", "Izabal", "Petén", "Zacapa"].map((d) => ({ valor: d, texto: d }))}
                  valores={zonasMarcadas}
                  onCambio={setZonasMarcadas}
                />
                <div className="flex flex-wrap gap-6">
                  <Interruptor etiqueta="Nota interna" activo={interruptor} onCambio={setInterruptor} />
                  <Interruptor etiqueta="Deshabilitado" activo={false} onCambio={() => {}} disabled />
                </div>
              </div>
            </Bloque>
          </div>
          <Bloque titulo="Buscador">
            <Buscador valor={busqueda} onCambio={setBusqueda} etiqueta="Buscar conversaciones" placeholder="Buscar por nombre, teléfono o texto" className="max-w-md" />
          </Bloque>
        </Seccion>

        <Seccion id="etiquetas" titulo="Etiquetas">
          <Bloque titulo="Canales · solo el logo de la marca de 16 px con tooltip (en listas y tablas); logo y nombre en la ficha del contacto, y logo en las opciones de los filtros">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                {(["whatsapp", "tiktok", "instagram", "facebook", "simulado"] as const).map((c) => (
                  <IconoCanal key={c} canal={c} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["whatsapp", "tiktok", "instagram", "facebook", "simulado"] as const).map((c) => (
                  <InsigniaCanal key={c} canal={c} />
                ))}
              </div>
            </div>
          </Bloque>
          <Bloque titulo="Avatar con canal · círculo de 18 px con el color del canal y el logo blanco, borde de superficie de 2 px · avatares solo de 32 y 40 px">
            <div className="flex flex-wrap items-center gap-4">
              {(["whatsapp", "instagram", "tiktok", "facebook", "simulado"] as const).map((c, i) => (
                <AvatarConCanal key={c} nombre={["Ana Pérez", "Luis Morales", "Carla Díaz", "Pedro Gómez", "Prueba Simulada"][i]!} canal={c} tamano={i % 2 ? "md" : "sm"} />
              ))}
            </div>
          </Bloque>
          <Bloque titulo="Estado de conversación, etiquetas de cliente y existencia">
            <div className="flex flex-wrap gap-2">
              <InsigniaConversacion estado="abierta" />
              <InsigniaConversacion estado="pendiente" />
              <InsigniaConversacion estado="cerrada" />
              <InsigniaEtiqueta nombre="Mayorista" tono="carbon" />
              <InsigniaEtiqueta nombre="Cliente frecuente" tono="naranja" />
              <InsigniaEtiqueta nombre="Envío a Morales" tono="exito" />
              <InsigniaExistencia cantidad={12} />
              <InsigniaExistencia cantidad={2} />
              <InsigniaExistencia cantidad={0} />
            </div>
          </Bloque>
          <Bloque titulo="Existencias en la tabla del catálogo · una columna por ubicación («Física», «En línea»); apartado en meta debajo; foto sin imagen con ícono ligero de 20 px">
            <div className="flex flex-wrap items-start gap-8">
              <div>
                <p className="meta mb-1 text-texto-suave">Física</p>
                <CeldaExistencia disponible={12} apartado={0} />
              </div>
              <div>
                <p className="meta mb-1 text-texto-suave">En línea</p>
                <CeldaExistencia disponible={6} apartado={2} />
              </div>
              <div>
                <p className="meta mb-1 text-texto-suave">Quedan pocas</p>
                <CeldaExistencia disponible={2} apartado={0} />
              </div>
              <div>
                <p className="meta mb-1 text-texto-suave">Agotado</p>
                <CeldaExistencia disponible={0} apartado={0} />
              </div>
              <FotoProducto url={null} className="size-12 rounded-campo" />
            </div>
          </Bloque>
          <Bloque titulo="Pedidos: una sola insignia de estado (InsigniaEstado), estado del pago y bloque «Compras»">
            <div className="flex flex-wrap gap-2">
              {(["borrador", "pendiente_pago", "en_revision", "pagado", "preparando", "listo_para_recoger", "enviado", "entregado", "cancelado", "vencido"] as const).map((e) => (
                <InsigniaEstado key={e} estado={e} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["sin_pago", "en_revision", "parcial", "pagado", "rechazado"] as const).map((e) => (
                <InsigniaPago key={e} estado={e} />
              ))}
            </div>
            <div className="mt-4 max-w-md">
              <ListaCompras
                compras={{
                  cantidad: 2,
                  totalComprado: 218_500,
                  pedidos: [
                    { id: "a", codigo: "HO-000123", fecha: "2026-11-02T15:00:00Z", total: 218_500, estado: "entregado" },
                    { id: "b", codigo: "HO-000130", fecha: "2026-11-03T15:00:00Z", total: 25_000, estado: "pendiente_pago" },
                  ],
                }}
              />
            </div>
          </Bloque>
          <Bloque titulo="Logos de marca de los canales · 14 px en su color, siempre con el nombre al lado (Simulado conserva su ícono)">
            <ul className="flex flex-wrap gap-6">
              {(["whatsapp", "instagram", "facebook", "tiktok", "simulado"] as const).map((c) => (
                <li key={c} className="meta flex items-center gap-1 text-texto-suave">
                  <LogoCanal canal={c} />
                  {nombreCanal(c)}
                </li>
              ))}
            </ul>
          </Bloque>
          <Bloque titulo="Contador de no leídos y avatares">
            <div className="flex flex-wrap items-center gap-4">
              <ContadorNoLeidos cantidad={1} />
              <ContadorNoLeidos cantidad={12} />
              <ContadorNoLeidos cantidad={120} />
              <Avatar nombre="Ana Pérez" tamano="sm" />
              <Avatar nombre="Luis Morales" />
              <Avatar nombre="Carla" />
              <Avatar nombre="Pedro Gómez" tamano="sm" />
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="conversacion" titulo="Conversación">
          <div className="grid gap-6 lg:grid-cols-2">
            <Bloque titulo="Item de conversación · tercera línea con logo, canal y estado en palabras (normal, seleccionado, con no leídos)">
              <div className="overflow-hidden rounded-tarjeta border border-linea">
                {[
                  ["Cliente de prueba 1", "whatsapp", "¿Tienen todavía la pantalla para carro?", "10:42", 2, "esperando", "abierta"],
                  ["Cliente de prueba 2", "tiktok", "¿Cuál es el horario?", "9:15", 0, "asistente", "abierta"],
                  ["Cliente de prueba 3", "instagram", "¿Hacen envíos a Morales?", "Ayer", 0, "asesor", "abierta"],
                  ["Cliente de prueba 4", "facebook", "Gracias, ya recibí mi pedido", "Lun", 0, "ninguna", "cerrada"],
                ].map(([nombre, canal, msg, hora, n, atencion, estado], i) => (
                  <ItemConversacion
                    key={nombre as string}
                    nombre={nombre as string}
                    canal={canal as "whatsapp"}
                    ultimoMensaje={msg as string}
                    hora={hora as string}
                    noLeidos={n as number}
                    atencion={atencion as "asistente"}
                    estado={estado as "abierta"}
                    asesor="Agente de prueba"
                    seleccionada={seleccionada === i}
                    onClick={() => setSeleccionada(i)}
                  />
                ))}
              </div>
            </Bloque>
            <Bloque titulo="Estados de entrega">
              <ul className="flex flex-col gap-3">
                {([["enviando", "Enviando"], ["enviado", "Enviado"], ["entregado", "Entregado"], ["leido", "Leído"], ["fallo", "No se envió"]] as [Entrega, string][]).map(([e, texto]) => (
                  <li key={e} className="cuerpo flex items-center gap-3">
                    <EstadoEntrega estado={e} />
                    {texto}
                  </li>
                ))}
              </ul>
            </Bloque>
          </div>

          <Bloque titulo="Burbujas">
            <div className="flex flex-col gap-3 rounded-tarjeta bg-fondo p-4">
              <SeparadorDia texto="Ayer" />
              <Burbuja tipo="entrante" texto="Hola, ¿tienen bocinas bluetooth?" hora="16:20" />
              <SeparadorDia texto="Hoy" />
              <Burbuja tipo="entrante" texto="¿Tienen todavía la pantalla para carro?" hora="10:42" />
              <Burbuja tipo="saliente" texto="Buenos días. Déjeme confirmar la existencia." hora="10:44" estado="leido" autor="Agente de prueba" />
              <Burbuja tipo="nota" texto="Quedan 2 en bodega, confirmar con la tienda." hora="10:45" autor="Agente de prueba" />
              <Burbuja tipo="producto" hora="10:46" estado="entregado" producto={{ nombre: "Pantalla para carro 9 pulgadas", sku: "EL-001", precioCentavos: 125000, existencia: 2, imagenUrl: "/placeholder/producto.svg" }} />
              <Burbuja tipo="saliente" texto="Este mensaje no salió." hora="10:47" estado="fallo" onReintentar={() => avisar("Reintentando envío")} />
              <Burbuja
                tipo="saliente"
                hora="10:48"
                estado="leido"
                autor="Agente de prueba"
                pedido={{
                  id: "demo",
                  codigo: "HO-000123",
                  estado: "pendiente_pago",
                  lineas: [{ nombre: "Pantalla para carro 9 pulgadas", cantidad: 1, total: 125000 }, { nombre: "Cubreasientos universal", cantidad: 2, total: 39800 }],
                  descuento: 0,
                  envio: "Envío a Morales · Gratis",
                  total: 164800,
                  cuentas: [{ banco: "Banco de prueba", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet (ficticio)" }],
                }}
              />
              <Burbuja
                tipo="saliente"
                hora="10:49"
                estado="entregado"
                autor="Agente de prueba"
                pedido={{ id: "demo", codigo: "HO-000124", estado: "pendiente_pago", lineas: [{ nombre: "Cubreasientos universal", cantidad: 1, total: 19900 }], descuento: 0, envio: "Recoger en tienda", total: 19900, cuentas: [], formaPago: "tarjeta", enlace: "https://pago.ejemplo.com/demo" }}
              />
              <Burbuja
                tipo="saliente"
                hora="10:50"
                estado="entregado"
                autor="Agente de prueba"
                pedido={{ id: "demo", codigo: "HO-000125", estado: "pendiente_pago", lineas: [{ nombre: "Organizador de maletero", cantidad: 1, total: 12900 }], descuento: 0, envio: "Recoger en tienda", total: 12900, cuentas: [], formaPago: "efectivo_en_tienda" }}
              />
              <Burbuja tipo="sistema" tono="neutro" texto="Conversación asignada a Agente de prueba" />
              <Burbuja tipo="sistema" tono="info" texto="El asistente pasó la conversación a un asesor" />
              <Burbuja tipo="sistema" tono="aviso" texto="Comprobante del pedido HO-000123 en revisión" />
              <Burbuja tipo="sistema" tono="exito" texto="Pago del pedido HO-000123 verificado" />
              <Burbuja tipo="sistema" tono="peligro" texto="El pedido HO-000124 venció" />
            </div>
          </Bloque>

          <Bloque titulo="Compositor · escriba / para ver las respuestas rápidas · Enter envía, Shift+Enter salta de línea · con la ventana de 24 horas cerrada, «Enviar plantilla» (del segundo compositor) abre las plantillas aprobadas">
            <div className="flex flex-col gap-4">
              <div className="rounded-tarjeta border border-linea">
                <Compositor
                  respuestasRapidas={respuestasRapidas}
                  aviso="La ventana para responder vence en 2 h 15 min"
                  onEnviar={(t, nota) => avisar(nota ? "Nota guardada" : "Mensaje enviado")}
                  onEnviarProducto={() => avisar("Aquí se abrirá el buscador del catálogo")}
                  onAdjuntar={() => avisar("Aquí se abrirá el selector de imagen")}
                  onSugerir={async () => "Buenos días. Sí, todavía tenemos la pantalla para carro. ¿Desea que se la reservemos?"}
                  onEnviarPlantilla={() => avisar("Aquí se abrirán las plantillas aprobadas")}
                />
              </div>
              <div className="rounded-tarjeta border border-linea">
                <Compositor
                  respuestasRapidas={respuestasRapidas}
                  bloqueadoMotivo="Pasaron más de 24 horas desde el último mensaje del cliente. Solo se pueden enviar plantillas aprobadas."
                  onEnviar={(t, nota) => avisar(nota ? "Nota guardada" : "Mensaje enviado")}
                  onEnviarPlantilla={() => setPlantillas(true)}
                />
              </div>
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="estructura" titulo="Estructura">
          <Bloque titulo="Pestañas con contador (flechas izquierda y derecha) · el contador es naranja solo si algo necesita atención">
            <PestanasConContador
              etiqueta="Filtro de pedidos"
              activa={pestana}
              onCambio={setPestana}
              pestanas={[
                { id: "sin-asignar", texto: "Por verificar", contador: 4, urgente: true },
                { id: "mias", texto: "Pendientes de pago", contador: 12 },
                { id: "todas", texto: "Todos" },
              ]}
            />
          </Bloque>
          <Bloque titulo="Control segmentado · dos o tres opciones en una sola pieza (flechas cambian de opción)">
            <div className="flex flex-wrap items-center gap-6">
              <ControlSegmentado
                etiqueta="Quién atiende"
                valor={atiende}
                onCambio={setAtiende}
                opciones={[
                  { valor: "asistente", texto: "Asistente" },
                  { valor: "asesor", texto: "Asesor" },
                ]}
              />
              <ControlSegmentado
                etiqueta="Rango de fechas"
                valor={rango}
                onCambio={setRango}
                opciones={[
                  { valor: "7", texto: "7 días" },
                  { valor: "30", texto: "30 días" },
                  { valor: "90", texto: "90 días" },
                ]}
              />
            </div>
          </Bloque>
          <Bloque titulo="Encabezado de página · título e insignias a la izquierda, acciones a la derecha en la misma línea (una sola acción principal)">
            <EncabezadoPagina
              titulo="HO-000123"
              insignias={<InsigniaEstado estado="en_revision" />}
              detalle={
                <>
                  <span>WhatsApp</span>
                  <span>3 nov 2026, 12:24 · Agente de prueba</span>
                </>
              }
            >
              <Boton>Verificar pago</Boton>
              <Boton variante="secundario">Ver conversación</Boton>
              <Boton variante="peligro-contorno">Cancelar pedido</Boton>
            </EncabezadoPagina>
          </Bloque>
          <Bloque titulo="Línea de pasos · completados con check, el actual destacado, los futuros en texto suave">
            <div className="flex flex-col gap-4">
              <LineaDePasos etiqueta="Avance del pedido" pasos={PASOS} actual={2} />
              <LineaDePasos etiqueta="Avance del pedido entregado" pasos={PASOS} actual={PASOS.length} />
              <LineaDePasos etiqueta="Avance del pedido vencido" pasos={PASOS} actual={0} detenido={<InsigniaEstado estado="vencido" />} />
              <LineaDePasos etiqueta="Avance del pedido cancelado" pasos={PASOS} actual={1} detenido={<InsigniaEstado estado="cancelado" />} />
            </div>
          </Bloque>
          <Bloque titulo="Botón «Filtros» · agrupa los filtros menos usados y muestra cuántos hay activos">
            <div className="flex justify-end">
              <BotonFiltros activos={2} onLimpiar={() => avisar("Filtros quitados")}>
                <Selector etiqueta="Estado" defaultValue="abierta" opciones={[{ valor: "abierta", texto: "Abiertas" }, { valor: "cerrada", texto: "Cerradas" }]} />
                <Selector etiqueta="Canal" defaultValue="whatsapp" opciones={[{ valor: "whatsapp", texto: "WhatsApp" }, { valor: "tiktok", texto: "TikTok" }]} />
              </BotonFiltros>
            </div>
          </Bloque>
          <Bloque titulo="Disponibilidad del asesor · barra superior: «Pausar» con motivo opcional; en pausa, el tiempo y «Activarme»; a los 15 minutos aparece el aviso">
            <div className="flex flex-col gap-4">
              <ControlDisponibilidad estado="disponible" minutos={0} motivo={null} onPausar={(m) => avisar(`Pausa: ${m ?? "sin motivo"}`)} onActivar={() => {}} />
              <ControlDisponibilidad estado="en_pausa" minutos={12} motivo="Almuerzo" onPausar={() => {}} onActivar={() => avisar("Disponible otra vez")} />
              <ControlDisponibilidad estado="desconectado" minutos={0} motivo={null} onPausar={() => {}} onActivar={() => avisar("Disponible otra vez")} />
              <div className="flex flex-wrap items-center gap-2">
                <InsigniaDisponibilidad estado="disponible" />
                <InsigniaDisponibilidad estado="en_pausa" minutos={31} />
                <InsigniaDisponibilidad estado="desconectado" />
                <Boton variante="secundario" tamano="sm" onClick={() => setPausaLarga(true)}>
                  Ver el aviso de pausa larga
                </Boton>
              </div>
            </div>
          </Bloque>
          <Bloque titulo="Equipo (administrador y jefe de tienda) · estado de cada asesor; con más de 30 min en pausa o desconectado y conversaciones abiertas aparece «Repartir sus conversaciones»">
            <div className="flex flex-col gap-4">
              <TablaEquipo
                ahora={Date.now()}
                filas={[
                  { id: "1", nombre: "Carlos Pérez", estado: "disponible", desde: new Date(Date.now() - 95 * 60_000).toISOString(), motivo: null, abiertas: 7, puedeRepartir: false },
                  { id: "2", nombre: "Mónica Aguilar", estado: "en_pausa", desde: new Date(Date.now() - 42 * 60_000).toISOString(), motivo: "Almuerzo", abiertas: 4, puedeRepartir: true },
                  { id: "3", nombre: "Luis Herrera", estado: "desconectado", desde: new Date(Date.now() - 240 * 60_000).toISOString(), motivo: null, abiertas: 0, puedeRepartir: false },
                ]}
                onCambiarEstado={(_, e) => avisar(`Estado: ${e}`)}
                onRepartir={() => avisar("Se repartirían las conversaciones")}
              />
              <div className="max-w-sm rounded-tarjeta bg-fondo py-3">
                <ResumenEquipo
                  ahora={Date.now()}
                  enlace={<span className="meta text-texto-suave">Ver el equipo</span>}
                  filas={[
                    { id: "1", nombre: "Carlos Pérez", estado: "disponible", desde: new Date().toISOString(), motivo: null, abiertas: 7, puedeRepartir: false },
                    { id: "2", nombre: "Mónica Aguilar", estado: "en_pausa", desde: new Date(Date.now() - 12 * 60_000).toISOString(), motivo: "Almuerzo", abiertas: 4, puedeRepartir: false },
                    { id: "3", nombre: "Luis Herrera", estado: "desconectado", desde: new Date().toISOString(), motivo: null, abiertas: 0, puedeRepartir: false },
                  ]}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => setDevolver(true)}>
                  Ver «Devolver a la cola»
                </Boton>
                <Boton variante="secundario" tamano="sm" onClick={() => setAsignar(true)}>
                  Ver «Asignar a otra persona»
                </Boton>
              </div>
            </div>
          </Bloque>
          <Bloque titulo="Aviso accionable · ícono, texto y una acción">
            <div className="flex flex-col gap-3">
              <AvisoAccionable tono="aviso" accion={<Boton tamano="sm" variante="secundario">Ver pagos</Boton>}>
                Hay 4 pagos por verificar
              </AvisoAccionable>
              <AvisoAccionable tono="peligro" accion={<Boton tamano="sm" variante="secundario">Enviar plantilla</Boton>}>
                Pasaron más de 24 horas desde el último mensaje del cliente
              </AvisoAccionable>
              <AvisoAccionable tono="info">El asistente está atendiendo esta conversación</AvisoAccionable>
            </div>
          </Bloque>
          <Tabla
            columnas={columnas}
            filas={filas.slice((pagina - 1) * porPagina, pagina * porPagina)}
            idFila={(p) => p.sku}
            alActivar={(p) => avisar(`Abriendo ${p.nombre}`)}
            descripcion="Productos de ejemplo"
            orden={orden}
            onOrden={ordenar}
            pagina={pagina}
            totalPaginas={totalPaginas}
            onPagina={setPagina}
          />
          <Bloque titulo="Modal, panel lateral, menú y aviso breve">
            <div className="flex flex-wrap gap-3">
              <Boton variante="secundario" onClick={() => setModal(true)}>
                Abrir modal
              </Boton>
              <Boton variante="secundario" onClick={() => setPanel(true)}>
                Abrir panel lateral
              </Boton>
              <MenuDesplegable
                etiqueta="Acciones"
                opciones={[
                  { texto: "Ver ficha", onElegir: () => avisar("Abriendo ficha") },
                  { texto: "Asignar a mí", onElegir: () => avisar("Conversación asignada") },
                  { texto: "Cerrar conversación", onElegir: () => avisar("No se pudo cerrar", "error"), peligro: true },
                ]}
              />
              <Boton variante="secundario" onClick={() => avisar("Producto guardado")}>
                Aviso de éxito
              </Boton>
              <Boton variante="secundario" onClick={() => avisar("No pudimos guardar el producto. Revise su conexión e inténtelo de nuevo.", "error")}>
                Aviso de error
              </Boton>
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="seguridad" titulo="Seguridad">
          <div className="grid gap-6 md:grid-cols-2">
            <Bloque titulo="Código QR del segundo factor · imagen generada en el servidor, con la clave para teclearla debajo">
              <QrSegundoFactor qr={QR_DE_EJEMPLO} secreto="ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567" />
            </Bloque>
            <Bloque titulo="Códigos de respaldo · se muestran una sola vez; cada uno sirve una vez">
              <CodigosRespaldo codigos={["k3m9x-q7vbn", "p4w8d-h2tzr", "n6c5y-e9ajs", "x2f7q-m3kvu", "t8b4h-w5pdn", "r9j6z-c2ymg", "d5s3v-k7ewq", "g4n8a-u6xhc"]} onListo={() => avisar("Códigos guardados")} />
            </Bloque>
            <Bloque titulo="Aviso de cierre por inactividad · un minuto antes de cerrar la sesión; cualquier movimiento lo quita">
              <Boton variante="secundario" tamano="sm" onClick={() => setInactividad(true)}>
                Ver el aviso de inactividad
              </Boton>
            </Bloque>
          </div>
        </Seccion>

        <Seccion id="estados" titulo="Carga y vacío">
          <div className="grid gap-6 md:grid-cols-2">
            <Bloque titulo="Estado vacío con acción">
              <EstadoVacio
                icono={Inbox}
                titulo="Todavía no hay mensajes"
                descripcion="Cuando un cliente escriba, aparecerá aquí."
                accion={
                  <Boton variante="secundario">
                    <Plus className="size-4" aria-hidden />
                    Crear contacto
                  </Boton>
                }
              />
            </Bloque>
            <Bloque titulo="Esqueletos de carga">
              <div className="overflow-hidden rounded-tarjeta border border-linea">
                <EsqueletoConversacion />
                <EsqueletoConversacion />
                <EsqueletoConversacion />
              </div>
              <Esqueleto className="mt-4 h-10 w-full" />
            </Bloque>
          </div>
        </Seccion>

        <Seccion id="asistente" titulo="Asistente">
          <Bloque titulo="Quién atiende la conversación">
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaAtencion atencion="asistente" />
              <InsigniaAtencion atencion="esperando" />
              <InsigniaAtencion atencion="asesor" asesor="Agente de prueba" />
              <AvatarAsistente />
              <AvatarAsistente tamano="md" />
            </div>
          </Bloque>
          <Bloque titulo="Mensaje del asistente, con lo que consultó (solo lo ve el equipo)">
            <div className="flex flex-col gap-3 rounded-tarjeta bg-fondo p-4">
              <Burbuja tipo="entrante" texto="¿Cuánto cuesta la pantalla para carro?" hora="10:42" />
              <Burbuja tipo="saliente" asistente texto="Pantalla para carro 9 pulgadas cuesta Q1,250.00. Por el momento no tiene existencia." hora="10:42" estado="leido" consultas={["Consultó: Pantalla para carro 9 pulgadas · existencia"]} />
              <Burbuja tipo="sistema" texto="El asistente pasó la conversación a un asesor · Motivo: quiere comprar" />
            </div>
          </Bloque>
        </Seccion>

        <Seccion id="graficas" titulo="Gráficas">
          <div className="grid gap-4 sm:grid-cols-3">
            <TarjetaKPI etiqueta="Conversaciones nuevas" valor="469" contexto="En 30 días" />
            <TarjetaKPI etiqueta="Resuelto por el asistente" valor="73 %" contexto="Sin pasar a asesor" />
            <TarjetaKPI etiqueta="Esperando asesor ahora" valor="6" alerta contexto="Conversaciones sin atender" />
            <TarjetaKPI etiqueta="Canal más usado" valor="WhatsApp" contexto="12 conversaciones" />
            <TarjetaKPI etiqueta="Último pedido" valor="3 nov" contexto="2026 · HO-000083" />
          </div>
          <Bloque titulo="Barras apiladas · 1 px de superficie entre segmentos; etiquetas de ejes de 12 px">
            <BarrasApiladas
              titulo="Conversaciones por día y canal"
              unidad="conversaciones nuevas por día"
              etiquetas={["1 oct", "2 oct", "3 oct", "4 oct", "5 oct", "6 oct", "7 oct"]}
              series={[
                { nombre: "WhatsApp", color: COLOR_CANAL.whatsapp, valores: [8, 9, 7, 11, 6, 10, 9] },
                { nombre: "Instagram", color: COLOR_CANAL.instagram, valores: [4, 3, 5, 4, 2, 5, 3] },
                { nombre: "TikTok", color: COLOR_CANAL.tiktok, valores: [2, 3, 2, 3, 1, 2, 2] },
                { nombre: "Facebook", color: COLOR_CANAL.facebook, valores: [1, 2, 1, 0, 2, 1, 1] },
                { nombre: "Otros", color: COLOR_CANAL.otros, valores: [1, 0, 1, 1, 0, 1, 0] },
              ]}
              resumen="Ejemplo con siete días de datos."
            />
          </Bloque>
          <Bloque titulo="Barras de costo · una sola serie en carbón, eje y valores en US$">
            <BarrasApiladas
              titulo="Costo del asistente por día"
              unidad="dólares (US$) por día"
              etiquetas={["1 oct", "2 oct", "3 oct", "4 oct", "5 oct", "6 oct", "7 oct"]}
              series={[{ nombre: "Costo", color: "var(--carbon)", valores: [0.12, 0.2, 0.15, 0.31, 0.08, 0.22, 0.18] }]}
              formato={(n) => `US$ ${n.toFixed(2)}`}
              resumen="Ejemplo con siete días de costo."
            />
          </Bloque>
          <div className="grid gap-4 md:grid-cols-2">
            <Bloque titulo="Barras horizontales · una sola serie en carbón; solo la barra que debe destacar va en naranja">
              <BarrasHorizontales titulo="Motivos más frecuentes" unidad="conversaciones" destacarMaximo datos={[{ etiqueta: "Precio", valor: 123 }, { etiqueta: "Existencia", valor: 98 }, { etiqueta: "Envío", valor: 62 }, { etiqueta: "Compra", valor: 41 }]} resumen="Ejemplo." />
            </Bloque>
            <Bloque titulo="Línea acumulada con límite">
              <LineaAcumulada titulo="Costo acumulado del mes" unidad="dólares (USD)" etiquetas={["1", "5", "10", "15", "20", "25", "30"]} valores={[0.2, 0.9, 1.7, 2.6, 3.4, 4.3, 5]} limite={6} resumen="Ejemplo." />
            </Bloque>
          </div>
        </Seccion>
      </div>

      <ModalPlantillas
        abierto={plantillas}
        onCerrar={() => setPlantillas(false)}
        plantillas={[
          { nombre: "seguimiento_cotizacion", idioma: "es", categoria: "UTILITY", cuerpo: "Hola {{1}}, ¿pudo revisar la cotización que le enviamos? Con gusto le ayudamos con cualquier duda.", variables: 1 },
          { nombre: "pedido_listo", idioma: "es", categoria: "UTILITY", cuerpo: "Hola {{1}}, su pedido {{2}} ya está listo para recoger. Lo esperamos en Home Outlet.", variables: 2 },
        ]}
        onEnviar={() => (setPlantillas(false), avisar("Plantilla enviada"))}
      />
      <ModalAsignar
        abierto={asignar}
        usuarios={[{ id: "1", nombre: "Admin de prueba" }, { id: "2", nombre: "Agente de prueba" }, { id: "3", nombre: "Carlos Pérez" }]}
        actualId="2"
        yoId="1"
        onCerrar={() => setAsignar(false)}
        onAsignar={() => (setAsignar(false), avisar("Conversación asignada"))}
        onQuitar={() => (setAsignar(false), avisar("Asignación quitada"))}
      />
      <ModalDevolver abierto={devolver} onCerrar={() => setDevolver(false)} onDevolver={() => (setDevolver(false), avisar("Devuelta a la cola"))} />
      <AvisoInactividad abierto={inactividad} segundos={42} onSeguir={() => setInactividad(false)} onSalir={() => (setInactividad(false), avisar("Aquí se cerraría la sesión"))} />
      <ModalPausaLarga abierto={pausaLarga} minutos={15} onActivar={() => (setPausaLarga(false), avisar("Disponible otra vez"))} onSeguir={() => setPausaLarga(false)} />
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Cerrar conversación">
        <p className="cuerpo mb-4">La conversación pasará a cerradas. Si el cliente vuelve a escribir, se abrirá de nuevo.</p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              setModal(false);
              avisar("Conversación cerrada");
            }}
          >
            Cerrar conversación
          </Boton>
        </div>
      </Modal>
      <PanelLateral abierto={panel} onCerrar={() => setPanel(false)} titulo="Ficha del contacto">
        <div className="flex flex-col items-start gap-3">
          <Avatar nombre="Cliente de prueba" />
          <p className="cuerpo-fuerte">Cliente de prueba</p>
          <p className="cuerpo">{formatTelefono("+50255550001")}</p>
          <InsigniaCanal canal="whatsapp" />
        </div>
      </PanelLateral>
    </>
  );
}
