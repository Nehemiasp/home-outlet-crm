"use client";

import { ShoppingBag, SearchX, WifiOff, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EstadoVacio, Esqueleto } from "@/components/ui/estados";
import { IconoCanal, InsigniaEstado, nombreCanal, opcionCanal } from "@/components/ui/etiquetas";
import { Boton, Buscador, CampoTexto, Selector } from "@/components/ui/form";
import { BotonFiltros, EncabezadoPagina, enlaceTabla, PestanasConContador, Tabla } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { CANALES } from "@/lib/canales/tipos";
import type { FilaPedido, FiltrosPedidos, Vista } from "@/lib/pedidos/consultas";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatQ } from "@/lib/utils";
import { listar, obtener, rechazar, verificar, type PedidoConPermisos } from "./actions";
import { AvisoCopiar } from "./[id]/aviso-copiar";
import { Verificacion } from "./[id]/verificacion";
import { NOMBRE_CORTO } from "@/lib/pedidos/metodos";
import { ListaCotizaciones } from "./cotizaciones";

const POR_PAGINA = 30;
const fecha = (iso: string) => new Date(iso).toLocaleString("es-GT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" });

const VACIO: Record<Vista, { titulo: string; descripcion: string }> = {
  "por-verificar": { titulo: "No hay pagos por verificar", descripcion: "Cuando un cliente mande un comprobante, aparecerá aquí." },
  pendientes: { titulo: "No hay pedidos pendientes de pago", descripcion: "Los pedidos enviados al cliente que esperan su pago aparecerán aquí." },
  "en-proceso": { titulo: "No hay pedidos en proceso", descripcion: "Aquí van los pedidos pagados hasta que se entregan." },
  entregados: { titulo: "Todavía no hay pedidos entregados", descripcion: "Los pedidos entregados al cliente aparecerán aquí." },
  todos: { titulo: "Todavía no hay pedidos", descripcion: "Cree uno desde una conversación con el botón «Crear pedido»." },
};

/** La pestaña «Cotizaciones» no es una vista de pedidos: tiene su propia lista (./cotizaciones.tsx). */
export type Pestana = Vista | "cotizaciones";

export function ListaPedidos({ vistaInicial, puedeVerificar, veTodo, asesores }: { vistaInicial: Pestana; puedeVerificar: boolean; veTodo: boolean; asesores: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [vista, setVista] = useState<Pestana>(vistaInicial);
  const enCotizaciones = vista === "cotizaciones";
  const [canal, setCanal] = useState<FiltrosPedidos["canal"]>("todos");
  const [entrega, setEntrega] = useState<FiltrosPedidos["entrega"]>("todas");
  const [asesor, setAsesor] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [verificando, setVerificando] = useState<{ datos: PedidoConPermisos; pagoId: string } | null>(null);
  const [copiar, setCopiar] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // En «Cotizaciones» la consulta de pedidos solo sirve para los contadores de las pestañas: se pide una fila.
  const filtros: FiltrosPedidos = { q, vista: enCotizaciones ? "todos" : vista, canal, asesor, entrega, desde, hasta, limite: enCotizaciones ? 1 : limite };
  const { datos, fallo, refrescar } = useActualizacion(JSON.stringify(filtros), () => listar(filtros), 10_000);
  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setLimite(POR_PAGINA);
  };
  const cambiarVista = (v: string) => {
    setVista(v as Pestana);
    setLimite(POR_PAGINA);
    // La vista va en la dirección para poder compartirla y para que el aviso de la barra lateral enlace directo.
    window.history.replaceState(null, "", `/pedidos?vista=${v}`);
  };
  const activos = [canal !== "todos", asesor !== "todos", entrega !== "todas", !!desde, !!hasta].filter(Boolean).length;
  const sinFiltros = activos === 0 && !q;
  const c = datos?.contadores;

  /** Abre el comprobante del pedido en el panel lateral, sin salir de la lista. */
  const abrirVerificacion = async (pedidoId: string) => {
    const r = await obtener(pedidoId);
    const pago = r?.pedido.pagos.find((p) => p.estado === "en_revision");
    if (!r || !pago) return void avisar("Este pedido ya no tiene pagos por verificar.", "error");
    setVerificando({ datos: r, pagoId: pago.id });
  };
  const tras = (aviso?: ResultadoAviso) => {
    if (aviso?.estado === "copiar" && aviso.texto) setCopiar(aviso.texto);
    else if (aviso?.estado === "fallo") avisar("El cambio se hizo, pero no se pudo avisar al cliente.", "error");
    refrescar();
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <EncabezadoPagina titulo="Pedidos" />

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-linea">
        <PestanasConContador
          etiqueta="Vistas de pedidos"
          activa={vista}
          onCambio={cambiarVista}
          pestanas={[
            { id: "por-verificar", texto: "Por verificar", contador: c?.porVerificar, urgente: true },
            { id: "pendientes", texto: "Pendientes de pago", contador: c?.pendientes },
            { id: "en-proceso", texto: "En proceso", contador: c?.enProceso },
            { id: "entregados", texto: "Entregados" },
            { id: "todos", texto: "Todos" },
            { id: "cotizaciones", texto: "Cotizaciones", contador: c?.cotizaciones },
          ]}
        />
        <div className="flex max-w-full min-w-0 items-end gap-2 pb-2">
          <Buscador valor={busqueda} onCambio={cambiar(setBusqueda)} etiqueta={enCotizaciones ? "Buscar cotizaciones" : "Buscar pedidos"} placeholder="Código, nombre o teléfono" className="w-72 min-w-0 shrink" />
          {!enCotizaciones && (
          <BotonFiltros
            activos={activos}
            onLimpiar={() => {
              setCanal("todos");
              setAsesor("todos");
              setEntrega("todas");
              setDesde("");
              setHasta("");
              setLimite(POR_PAGINA);
            }}
          >
            <Selector etiqueta="Canal" value={canal} onCambio={cambiar((v: string) => setCanal(v as FiltrosPedidos["canal"]))} opciones={[{ valor: "todos", texto: "Todos" }, ...CANALES.map(opcionCanal)]} />
            {veTodo && (
              <Selector etiqueta="Asesor" value={asesor} onCambio={cambiar(setAsesor)} opciones={[{ valor: "todos", texto: "Todos" }, { valor: "sin", texto: "Sin asesor" }, ...asesores.map((a) => ({ valor: a.id, texto: a.nombre }))]} />
            )}
            <Selector
              etiqueta="Entrega"
              value={entrega}
              onCambio={cambiar((v: string) => setEntrega(v as FiltrosPedidos["entrega"]))}
              opciones={[{ valor: "todas", texto: "Todas" }, { valor: "recoger", texto: "Recoger en tienda" }, { valor: "envio", texto: "Envío" }]}
            />
            <CampoTexto etiqueta="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar(setDesde)(e.target.value)} />
            <CampoTexto etiqueta="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar(setHasta)(e.target.value)} />
          </BotonFiltros>
          )}
        </div>
      </div>

      <div role="region" aria-label={enCotizaciones ? "Lista de cotizaciones" : "Lista de pedidos"} aria-live="polite">
        {vista === "cotizaciones" ? (
          <ListaCotizaciones q={q} />
        ) : !datos && fallo ? (
          <EstadoVacio icono={WifiOff} titulo="No pudimos cargar los pedidos" descripcion="Revise su conexión. Se volverá a intentar solo." accion={<Boton variante="secundario" onClick={refrescar}>Reintentar</Boton>} />
        ) : !datos ? (
          <div className="flex flex-col gap-2" aria-label="Cargando">
            <Esqueleto className="h-12" />
            <Esqueleto className="h-12" />
            <Esqueleto className="h-12" />
          </div>
        ) : datos.items.length === 0 ? (
          sinFiltros ? (
            <EstadoVacio icono={vista === "por-verificar" ? CircleCheck : ShoppingBag} titulo={VACIO[vista].titulo} descripcion={VACIO[vista].descripcion} />
          ) : (
            <EstadoVacio icono={SearchX} titulo="No hay pedidos con estos filtros" descripcion="Cambie los filtros o borre la búsqueda." />
          )
        ) : (
          <>
            <Tabla<FilaPedido>
              descripcion="Pedidos, del más reciente al más antiguo"
              filas={datos.items}
              idFila={(p) => p.id}
              alActivar={(p) => router.push(`/pedidos/${p.id}`)}
              pagina={1}
              totalPaginas={1}
              onPagina={() => {}}
              columnas={[
                { clave: "codigo", titulo: "Código", render: (p) => <Link href={`/pedidos/${p.id}`} className={`${enlaceTabla} whitespace-nowrap max-md:inline-block max-md:min-h-11 max-md:leading-11`}>{p.codigo}</Link> },
                { clave: "cliente", titulo: "Cliente", render: (p) => <Link href={`/contactos/${p.contactoId}`} className={enlaceTabla}>{p.cliente}</Link> },
                { clave: "canal", titulo: "Canal", ocultarMovil: true, render: (p) => <IconoCanal canal={p.canal} /> },
                { clave: "fecha", titulo: "Fecha", ocultarMovil: true, render: (p) => <span className="whitespace-nowrap">{fecha(p.fecha)}</span> },
                { clave: "entrega", titulo: "Entrega", ocultarMovil: true, ocultarHastaXl: true, render: (p) => (p.entrega === "envio" ? "Envío" : "Recoger") },
                { clave: "metodo", titulo: "Pago", ocultarMovil: true, ocultarHastaXl: true, render: (p) => (p.metodoPago ? NOMBRE_CORTO[p.metodoPago] : <span className="text-texto-suave">—</span>) },
                { clave: "estado", titulo: "Estado", render: (p) => <InsigniaEstado estado={p.estado} /> },
                { clave: "total", titulo: "Total", alinear: "der", render: (p) => <span className="cuerpo-fuerte whitespace-nowrap">{formatQ(p.total)}</span> },
                ...(vista === "por-verificar" && puedeVerificar
                  ? [{ clave: "accion", titulo: "Acción", alinear: "der" as const, render: (p: FilaPedido) => <Boton variante="secundario" tamano="sm" onClick={() => void abrirVerificacion(p.id)}>Verificar</Boton> }]
                  : []),
              ]}
            />
            {datos.hayMas && (
              <div className="mt-4">
                <Boton variante="secundario" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                  Cargar más pedidos
                </Boton>
              </div>
            )}
          </>
        )}
      </div>

      {verificando && (
        <Verificacion
          lateral
          pago={verificando.datos.pedido.pagos.find((p) => p.id === verificando.pagoId) ?? null}
          pedido={verificando.datos.pedido}
          puedeVerificar={verificando.datos.puedeVerificar}
          onCerrar={() => setVerificando(null)}
          onConfirmar={async (pagoId) => {
            const r = await verificar(pagoId);
            if (!r.ok) return void avisar(r.error, "error");
            avisar(r.cubierto ? "Pago confirmado. El pedido está pagado." : `Pago confirmado. Falta ${formatQ(r.saldo)}.`);
            setVerificando(null);
            tras(r.aviso);
          }}
          onRechazar={async (pagoId, motivo, mensaje) => {
            const r = await rechazar(pagoId, motivo, mensaje);
            if (!r.ok) return void avisar(r.error, "error");
            avisar("Pago rechazado");
            setVerificando(null);
            tras(r.aviso);
          }}
        />
      )}
      <AvisoCopiar texto={copiar} onCerrar={() => setCopiar(null)} />
    </div>
  );
}
