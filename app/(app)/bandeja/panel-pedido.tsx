"use client";

import { FileText, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Insignia, InsigniaCotizacion } from "@/components/ui/etiquetas";
import { AreaTexto, Boton, Buscador, Casilla, CampoTexto, Selector } from "@/components/ui/form";
import { PanelLateral } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { TipoPago } from "@/generated/prisma/client";
import { ETIQUETA_ESTADO } from "@/lib/pedidos/estados";
import { compatibleConEntrega } from "@/lib/pedidos/metodos";
import type { DatosPanelPedido, EntradaPedido, ProductoPedido, VistaPedido } from "@/lib/pedidos/tipos";
import { DEPARTAMENTOS, municipiosDe } from "@/lib/guatemala";
import { formatQ } from "@/lib/utils";
import { abrirPanelPedido, buscarProductosPedido, cargarBorradorPedido, cargarCotizacionParaPedido, enviarCotizacionPedido, enviarPedido, guardarBorradorPedido, previsualizarPedido } from "./pedido-actions";

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", timeZone: "America/Guatemala" });

type Linea = { p: ProductoPedido; cantidad: number; ubicacionId: string | null };

/** Disponible del producto en la ubicación de la línea (inventario separado) o en total (compartido). */
function textoDisponible(l: Linea, datos: DatosPanelPedido, ubicacion: string | null) {
  if (datos.inventario === "compartido") return `Disponible ${l.p.disponible} · Apartado ${l.p.apartado}`;
  const u = l.p.ubicaciones.find((x) => x.id === ubicacion);
  return `Disponible ${u?.disponible ?? 0} · Apartado ${u?.apartado ?? 0}`;
}

/** `convertir`: al abrir, carga esa cotización para hacer el pedido (viene de «Convertir en pedido» en Pedidos → Cotizaciones). */
export function PanelPedido({ abierto, onCerrar, conversacionId, puedeEnviar, onCambio, convertir }: { abierto: boolean; onCerrar: () => void; conversacionId: string; puedeEnviar: boolean; onCambio: () => void; convertir?: string | null }) {
  const avisar = useToast();
  const [datos, setDatos] = useState<DatosPanelPedido | null>(null);
  const [vistaPanel, setVistaPanel] = useState<"intro" | "form" | "copiado">("form");
  const [textoCopiable, setTextoCopiable] = useState("");
  const [copiadoDe, setCopiadoDe] = useState<"pedido" | "cotizacion">("pedido");

  const [pedidoId, setPedidoId] = useState<string | null>(null);
  // El pedido que sale de una cotización la lleva ligada: el servidor respeta sus precios.
  const [cotizacion, setCotizacion] = useState<{ id: string; codigo: string; nota: string | null } | null>(null);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", departamento: "", municipio: "" });
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [entrega, setEntrega] = useState<"recoger" | "envio">("recoger");
  const [metodoPago, setMetodoPago] = useState<TipoPago | null>(null);
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [descTipo, setDescTipo] = useState<"monto" | "porcentaje">("monto");
  const [descValor, setDescValor] = useState("");
  const [descMotivo, setDescMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [sobrePedido, setSobrePedido] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoPedido[]>([]);
  const [vista, setVista] = useState<VistaPedido | null>(null);
  const [errorVista, setErrorVista] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const reiniciar = (d: DatosPanelPedido) => {
    setPedidoId(null);
    setCotizacion(null);
    setCliente(d.contacto);
    setLineas([]);
    setEntrega("recoger");
    setMetodoPago(d.metodosPago.length === 1 ? d.metodosPago[0]!.id : null); // con una sola opción no hay nada que elegir
    setDireccion("");
    setReferencia("");
    setDescTipo("monto");
    setDescValor("");
    setDescMotivo("");
    setNotas("");
    setSobrePedido(false);
    setBusqueda("");
    setVista(null);
    setErrorVista("");
    setError("");
  };

  // Al abrir se cargan los datos del cliente, las zonas y los pedidos abiertos de la conversación.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void abrirPanelPedido(conversacionId).then((r) => {
      if (!vigente) return;
      if (!r.ok) return avisar(r.error, "error");
      setDatos(r.datos);
      reiniciar(r.datos);
      if (convertir) void convertirCotizacion(convertir);
      else setVistaPanel(r.datos.abiertos.length || r.datos.cotizaciones.length ? "intro" : "form");
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, conversacionId, convertir]);

  // Buscador del catálogo
  useEffect(() => {
    if (!abierto || vistaPanel !== "form") return;
    let vigente = true;
    const t = setTimeout(() => void buscarProductosPedido(busqueda).then((r) => vigente && setResultados(r)), 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [abierto, busqueda, vistaPanel]);

  const entrada = useMemo<EntradaPedido>(
    () => ({
      pedidoId, conversacionId, cliente, cotizacionId: cotizacion?.id ?? null,
      lineas: lineas.map((l) => ({ productoId: l.p.id, cantidad: l.cantidad, ubicacionId: l.ubicacionId })),
      entrega, direccion, referencia, metodoPago,
      descuento: descValor.trim() ? { tipo: descTipo, valor: descValor } : null,
      descuentoMotivo: descMotivo, notas,
    }),
    [pedidoId, conversacionId, cliente, cotizacion, lineas, entrega, direccion, referencia, metodoPago, descTipo, descValor, descMotivo, notas],
  );

  // El resumen lo calcula el servidor: el navegador solo manda lo que eligió la persona.
  const clave = JSON.stringify(entrada);
  useEffect(() => {
    if (!abierto || vistaPanel !== "form" || lineas.length === 0) {
      setVista(null);
      setErrorVista("");
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      void previsualizarPedido(entrada).then((r) => {
        if (!vigente) return;
        if (r.ok) {
          setVista(r.vista);
          setErrorVista("");
        } else {
          setVista(null);
          setErrorVista(r.error);
        }
      });
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, vistaPanel, clave]);

  const agregar = (p: ProductoPedido) =>
    setLineas((ls) => (ls.some((l) => l.p.id === p.id && l.ubicacionId === null) ? ls.map((l) => (l.p.id === p.id && l.ubicacionId === null ? { ...l, cantidad: Math.min(999, l.cantidad + 1) } : l)) : [...ls, { p, cantidad: 1, ubicacionId: null }]));
  const cambiar = (i: number, cambio: Partial<Linea>) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, ...cambio } : l)));
  const quitar = (i: number) => setLineas((ls) => ls.filter((_, k) => k !== i));

  /** Llena el formulario con lo guardado (un borrador o una cotización). */
  const llenar = (e: EntradaPedido, productos: ProductoPedido[]) => {
    setPedidoId(e.pedidoId);
    setCliente(e.cliente);
    setLineas(e.lineas.map((l, i) => ({ p: productos[i]!, cantidad: l.cantidad, ubicacionId: l.ubicacionId })));
    setEntrega(e.entrega);
    setMetodoPago(e.metodoPago ?? null);
    setDireccion(e.direccion);
    setReferencia(e.referencia);
    setDescTipo(e.descuento?.tipo ?? "monto");
    setDescValor(e.descuento?.valor ?? "");
    setDescMotivo(e.descuentoMotivo);
    setNotas(e.notas);
    setVistaPanel("form");
  };

  const convertirCotizacion = async (id: string) => {
    const r = await cargarCotizacionParaPedido(id, conversacionId);
    if (!r.ok) {
      avisar(r.error, "error");
      return setVistaPanel("form");
    }
    setCotizacion({ id, codigo: r.cotizacion, nota: r.aviso });
    llenar(r.entrada, r.productos);
  };

  const continuarBorrador = async (id: string) => {
    const r = await cargarBorradorPedido(id, conversacionId);
    if (!r.ok) return avisar(r.error, "error");
    const e = r.entrada;
    setCotizacion(e.cotizacionId && r.cotizacion ? { id: e.cotizacionId, codigo: r.cotizacion, nota: null } : null);
    llenar(e, r.productos);
  };

  const guardar = async () => {
    setTrabajando(true);
    setError("");
    const r = await guardarBorradorPedido(entrada);
    setTrabajando(false);
    if (!r.ok) return setError(r.error);
    setPedidoId(r.pedidoId);
    avisar(`Borrador ${r.codigo} guardado`);
    onCambio();
  };

  const enviar = async () => {
    setTrabajando(true);
    setError("");
    const modo = puedeEnviar ? "enviar" : "copiado";
    const r = await enviarPedido(entrada, modo, sobrePedido);
    setTrabajando(false);
    if (!r.ok) {
      onCambio(); // si falló después de apartar, el pedido ya cambió de estado
      return setError(r.error);
    }
    onCambio();
    if (modo === "enviar") {
      avisar(`Pedido ${r.codigo} enviado al cliente`);
      return onCerrar();
    }
    void mostrarParaCopiar(r.texto, "pedido");
  };

  const mostrarParaCopiar = async (texto: string, de: "pedido" | "cotizacion") => {
    setTextoCopiable(texto);
    setCopiadoDe(de);
    setVistaPanel("copiado");
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Mensaje copiado");
    } catch {
      /* el texto queda a la vista para copiarlo a mano */
    }
  };

  /** Lo armado, como cotización: el cliente recibe precios y vigencia; no se aparta nada ni se pide forma de pago. */
  const cotizar = async () => {
    setTrabajando(true);
    setError("");
    const modo = puedeEnviar ? "enviar" : "copiado";
    const r = await enviarCotizacionPedido(entrada, modo);
    setTrabajando(false);
    onCambio();
    if (!r.ok) return setError(r.error);
    if (modo === "enviar") {
      avisar(`Cotización ${r.codigo} enviada al cliente`);
      return onCerrar();
    }
    void mostrarParaCopiar(r.texto, "cotizacion");
  };

  const sugeridos = datos?.sugeridos ?? [];
  const mostrados = busqueda.trim() ? resultados : sugeridos.length ? sugeridos : resultados;
  const ubicacionDeLinea = (l: Linea) => l.ubicacionId ?? datos?.ubicacionPorEntrega[entrega] ?? null;
  const formas = (datos?.metodosPago ?? []).filter((m) => compatibleConEntrega(m.id, entrega)); // el efectivo solo si el cliente recoge
  const bloqueado = !vista || !!errorVista || lineas.length === 0 || !metodoPago || (vista.sinExistencia && !(datos?.sinLimites && sobrePedido));

  return (
    <PanelLateral abierto={abierto} onCerrar={onCerrar} titulo="Crear pedido">
      {!datos ? (
        <p className="cuerpo text-texto-suave">Cargando…</p>
      ) : vistaPanel === "intro" ? (
        <div className="flex flex-col gap-4">
          {datos.abiertos.length > 0 && <p className="cuerpo">Esta conversación ya tiene {datos.abiertos.length === 1 ? "un pedido abierto" : "pedidos abiertos"}:</p>}
          <ul className={datos.abiertos.length ? "flex flex-col divide-y divide-linea rounded-tarjeta border border-linea" : "hidden"}>
            {datos.abiertos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="cuerpo-fuerte">{a.codigo}</p>
                  <p className="meta text-texto-suave">
                    {ETIQUETA_ESTADO[a.estado]} · {formatQ(a.total)}
                  </p>
                </div>
                {a.estado === "borrador" ? (
                  <Boton tamano="sm" variante="secundario" onClick={() => void continuarBorrador(a.id)}>
                    Continuar borrador
                  </Boton>
                ) : (
                  <Link href={`/pedidos/${a.id}`} className="cuerpo-fuerte inline-flex h-9 items-center rounded-campo border border-linea bg-superficie px-3 hover:bg-fondo">
                    Ver pedido abierto
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {datos.cotizaciones.length > 0 && (
            <>
              <p className="cuerpo">{datos.cotizaciones.length === 1 ? "Cotización que se puede convertir en pedido:" : "Cotizaciones que se pueden convertir en pedido:"}</p>
              <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
                {datos.cotizaciones.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="cuerpo-fuerte flex flex-wrap items-center gap-2">
                        {c.codigo} <InsigniaCotizacion estado={c.estado} />
                      </p>
                      <p className="meta text-texto-suave">
                        {formatQ(c.total)} · {c.estado === "vencida" ? "venció" : "vale hasta"} el {fechaCorta(c.validaHasta)}
                      </p>
                    </div>
                    <Boton tamano="sm" variante="secundario" onClick={() => void convertirCotizacion(c.id)}>
                      Convertir en pedido
                    </Boton>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Boton variante="secundario" onClick={() => setVistaPanel("form")}>
            {datos.abiertos.length ? "Crear otro pedido" : "Crear pedido nuevo"}
          </Boton>
        </div>
      ) : vistaPanel === "copiado" ? (
        <div className="flex flex-col gap-4">
          <p className="cuerpo">
            {copiadoDe === "cotizacion" ? "La cotización quedó guardada y marcada como enviada." : "El pedido quedó apartado y marcado como enviado."} Pegue este mensaje en {puedeEnviar ? "el chat" : "la conversación del canal"} del cliente:
          </p>
          <textarea readOnly value={textoCopiable} aria-label="Mensaje para el cliente" rows={14} className="cuerpo w-full resize-none rounded-campo border border-texto-suave p-3" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end gap-2">
            <Boton
              variante="secundario"
              onClick={() => void navigator.clipboard.writeText(textoCopiable).then(() => avisar("Mensaje copiado"), () => avisar("No se pudo copiar. Selecciónelo y cópielo a mano.", "error"))}
            >
              Copiar de nuevo
            </Boton>
            <Boton onClick={onCerrar}>Listo</Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {cotizacion && (
            <div className="flex flex-col gap-1 rounded-campo bg-fondo p-3">
              <p className="cuerpo-fuerte">Pedido desde la cotización {cotizacion.codigo}</p>
              <p className="meta text-texto-suave">{cotizacion.nota ?? "Lleva los precios cotizados. Elija la forma de pago y envíelo al cliente."}</p>
            </div>
          )}
          <section aria-label="Cliente" className="flex flex-col gap-3">
            <h3 className="cuerpo-fuerte">Cliente</h3>
            <CampoTexto etiqueta="Nombre" autoComplete="off" maxLength={80} value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
            <CampoTexto etiqueta="Teléfono" autoComplete="off" inputMode="tel" maxLength={20} value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
          </section>

          <section aria-label="Productos" className="flex flex-col gap-3">
            <h3 className="cuerpo-fuerte">Productos</h3>
            {lineas.length > 0 && (
              <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
                {lineas.map((l, i) => (
                  <li key={`${l.p.id}-${i}`} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.p.imagenUrl ?? "/placeholder/producto.svg"} alt="" className="size-12 shrink-0 rounded-campo bg-fondo object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="cuerpo-fuerte">{l.p.nombre}</p>
                        <p className="meta text-texto-suave">
                          {/* el precio que calculó el servidor: con una cotización vigente puede ser el cotizado, no el del catálogo */}
                          {formatQ(vista?.lineas.find((v) => v.productoId === l.p.id)?.precio ?? l.p.precioCentavos)} · {textoDisponible(l, datos, ubicacionDeLinea(l))}
                        </p>
                      </div>
                      <Boton variante="fantasma" tamano="sm" aria-label={`Quitar ${l.p.nombre}`} onClick={() => quitar(i)}>
                        <Trash2 className="size-4" aria-hidden />
                      </Boton>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1" role="group" aria-label={`Cantidad de ${l.p.nombre}`}>
                        <Boton variante="secundario" tamano="sm" aria-label="Una menos" disabled={l.cantidad <= 1} onClick={() => cambiar(i, { cantidad: l.cantidad - 1 })}>
                          <Minus className="size-4" aria-hidden />
                        </Boton>
                        <span className="cuerpo-fuerte w-8 text-center" aria-live="polite">
                          {l.cantidad}
                        </span>
                        <Boton variante="secundario" tamano="sm" aria-label="Una más" disabled={l.cantidad >= 999} onClick={() => cambiar(i, { cantidad: l.cantidad + 1 })}>
                          <Plus className="size-4" aria-hidden />
                        </Boton>
                      </div>
                      {datos.inventario === "separado" && datos.ubicaciones.length > 1 && (
                        <Selector
                          etiqueta={`Sale de (${l.p.nombre})`}
                          etiquetaOculta
                          className="min-w-44 flex-1"
                          opciones={datos.ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
                          value={ubicacionDeLinea(l) ?? ""}
                          onCambio={(v) => cambiar(i, { ubicacionId: v })}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Buscador valor={busqueda} onCambio={setBusqueda} etiqueta="Buscar en el catálogo" placeholder="Nombre o SKU" />
            {!busqueda.trim() && sugeridos.length > 0 && <p className="meta text-texto-suave">Sugeridos: productos de esta conversación.</p>}
            <ul className="flex max-h-64 flex-col divide-y divide-linea overflow-y-auto rounded-tarjeta border border-linea">
              {mostrados.length === 0 && <li className="cuerpo p-3 text-texto-suave">No hay productos con ese nombre.</li>}
              {mostrados.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imagenUrl ?? "/placeholder/producto.svg"} alt="" className="size-10 shrink-0 rounded-campo bg-fondo object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="cuerpo-fuerte truncate">{p.nombre}</p>
                    <p className="meta text-texto-suave">
                      {formatQ(p.precioCentavos)} · Disponible {p.disponible} · Apartado {p.apartado}
                    </p>
                    {datos.inventario === "separado" && (
                      <p className="meta text-texto-suave">{p.ubicaciones.map((u) => `${u.nombre}: ${u.disponible}`).join(" · ")}</p>
                    )}
                  </div>
                  <Boton tamano="sm" variante="secundario" aria-label={`Agregar ${p.nombre}`} onClick={() => agregar(p)}>
                    Agregar
                  </Boton>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Entrega" className="flex flex-col gap-3">
            <h3 className="cuerpo-fuerte">Entrega</h3>
            <div role="radiogroup" aria-label="Tipo de entrega" className="flex flex-wrap gap-2">
              {(["recoger", "envio"] as const).map((v) => (
                <label key={v} className={`cuerpo-fuerte inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-campo border px-3 ${entrega === v ? "border-carbon bg-fondo" : "border-linea"}`}>
                  <input
                    type="radio"
                    name="entrega"
                    className="size-4"
                    checked={entrega === v}
                    onChange={() => {
                      setEntrega(v);
                      if (metodoPago && !compatibleConEntrega(metodoPago, v)) setMetodoPago(null); // el efectivo no sirve para un envío
                    }}
                  />
                  {v === "recoger" ? "Recoger en tienda" : "Envío"}
                </label>
              ))}
            </div>
            {entrega === "envio" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Selector
                    etiqueta="Departamento"
                    placeholder="Elegir departamento…"
                    value={cliente.departamento}
                    onCambio={(v) => setCliente({ ...cliente, departamento: v, municipio: "" })}
                    opciones={DEPARTAMENTOS.map((d) => ({ valor: d, texto: d }))}
                  />
                  <Selector
                    etiqueta="Municipio"
                    placeholder={cliente.departamento ? "Elegir municipio…" : "Elija primero el departamento"}
                    disabled={!cliente.departamento}
                    value={cliente.municipio}
                    onCambio={(v) => setCliente({ ...cliente, municipio: v })}
                    opciones={municipiosDe(cliente.departamento).map((m) => ({ valor: m, texto: m }))}
                  />
                </div>
                <AreaTexto etiqueta="Dirección de entrega" maxLength={300} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                <CampoTexto etiqueta="Referencia" autoComplete="off" maxLength={200} ayuda="Por ejemplo: casa azul frente a la iglesia." value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                {vista?.zona && (
                  <p className="meta text-texto-suave">
                    Zona: {vista.zona.nombre} · {vista.zona.tiempo}
                  </p>
                )}
              </>
            )}
          </section>

          <section aria-label="Forma de pago" className="flex flex-col gap-3">
            <h3 className="cuerpo-fuerte">Forma de pago</h3>
            {formas.length === 0 ? (
              <p className="meta rounded-campo bg-fondo p-3 text-texto-suave">No hay formas de pago activas. El administrador las enciende en Ajustes → Pagos y envíos.</p>
            ) : (
              <>
                <div role="radiogroup" aria-label="Forma de pago" className="flex flex-wrap gap-2">
                  {formas.map((m) => (
                    <label key={m.id} className={`cuerpo-fuerte inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-campo border px-3 ${metodoPago === m.id ? "border-carbon bg-fondo" : "border-linea"}`}>
                      <input type="radio" name="forma-pago" className="size-4" checked={metodoPago === m.id} onChange={() => setMetodoPago(m.id)} />
                      {m.nombre}
                    </label>
                  ))}
                </div>
                <p className="meta text-texto-suave" aria-live="polite">
                  {metodoPago === "tarjeta"
                    ? "Al enviar el pedido, el cliente recibe también un enlace seguro para pagar con tarjeta."
                    : metodoPago === "efectivo_en_tienda"
                      ? "El cliente paga en efectivo al recoger. El pago se registra y se confirma cuando llegue."
                      : metodoPago
                        ? "El resumen lleva las cuentas bancarias; el cliente manda la foto del comprobante por el chat."
                        : "Pregúntele al cliente cómo quiere pagar. Hace falta para poder enviar el pedido."}
                </p>
              </>
            )}
          </section>

          <section aria-label="Descuento" className="flex flex-col gap-3">
            <h3 className="cuerpo-fuerte">Descuento (opcional)</h3>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <Selector
                etiqueta="Tipo"
                opciones={[
                  { valor: "monto", texto: "Monto (Q)" },
                  { valor: "porcentaje", texto: "Porcentaje (%)" },
                ]}
                value={descTipo}
                onCambio={(v) => setDescTipo(v as "monto" | "porcentaje")}
              />
              <CampoTexto etiqueta="Valor" inputMode="decimal" autoComplete="off" maxLength={12} value={descValor} onChange={(e) => setDescValor(e.target.value)} />
            </div>
            {descValor.trim() && <CampoTexto etiqueta="Motivo del descuento" autoComplete="off" maxLength={200} value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} />}
            {!datos.sinLimites && <p className="meta text-texto-suave">{datos.descuentoMaxAgente > 0 ? `Usted puede dar hasta ${datos.descuentoMaxAgente} %. Más de eso lo autoriza un administrador o un jefe de tienda.` : "Los descuentos los autoriza un administrador."}</p>}
          </section>

          <AreaTexto etiqueta="Notas del pedido" maxLength={500} ayuda="Solo las ve el equipo." value={notas} onChange={(e) => setNotas(e.target.value)} />

          <section aria-label="Resumen" aria-live="polite" className="flex flex-col gap-1 rounded-tarjeta border border-linea bg-fondo p-3">
            <h3 className="cuerpo-fuerte">Resumen</h3>
            {errorVista && <p className="meta text-error">{errorVista}</p>}
            {!vista && !errorVista && <p className="meta text-texto-suave">Agregue productos para ver el total.</p>}
            {vista && (
              <>
                <Fila etiqueta="Subtotal" valor={formatQ(vista.subtotal)} />
                {vista.descuentoMonto > 0 && <Fila etiqueta="Descuento" valor={`-${formatQ(vista.descuentoMonto)}`} />}
                {entrega === "envio" && <Fila etiqueta="Envío" valor={vista.costoEnvio === 0 ? "Gratis" : formatQ(vista.costoEnvio)} />}
                <Fila etiqueta="Total" valor={formatQ(vista.total)} fuerte />
                {vista.avisos.map((a) => (
                  <p key={a} className="meta mt-1 rounded-campo bg-aviso-suave p-2 text-aviso">
                    {a}
                  </p>
                ))}
              </>
            )}
          </section>

          {vista?.sinExistencia &&
            (datos.sinLimites ? (
              <Casilla etiqueta="Apartar «sobre pedido» aunque no alcance la existencia" checked={sobrePedido} onChange={(e) => setSobrePedido(e.target.checked)} />
            ) : (
              <p className="meta text-texto-suave">Para enviarlo sin existencia suficiente, un administrador o un jefe de tienda debe apartarlo «sobre pedido».</p>
            ))}

          {!puedeEnviar && (
            <p className="meta rounded-campo bg-fondo p-3 text-texto-suave">
              Este canal no permite enviar mensajes desde aquí ahora. El pedido se aparta igual y usted copia el resumen para mandarlo por el canal.
            </p>
          )}
          {error && (
            <p role="alert" className="meta text-error">
              {error}
            </p>
          )}
          {/* Arriba las dos acciones de apoyo, lado a lado; abajo, a todo lo ancho, la principal: enviar el pedido.
              `-bottom-4`: el panel tiene 16 px de relleno y un pie pegado con bottom-0 quedaría esa distancia por encima del
              borde, dejando ver por debajo lo que se desplaza. */}
          <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col gap-2 border-t border-linea bg-superficie p-4">
            <div className={cotizacion ? "grid" : "grid grid-cols-2 gap-2"}>
              {/* En un teléfono angosto el texto puede partirse en dos líneas: centrado y sin que el ícono se encoja. */}
              <Boton variante="secundario" onClick={guardar} disabled={trabajando || lineas.length === 0} className="text-center leading-tight">
                Guardar borrador
              </Boton>
              {!cotizacion && (
                <Boton variante="secundario" onClick={cotizar} disabled={trabajando || !vista || !!errorVista || lineas.length === 0} className="text-center leading-tight">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  {puedeEnviar ? "Enviar cotización" : "Copiar cotización"}
                </Boton>
              )}
            </div>
            <Boton onClick={enviar} cargando={trabajando} disabled={bloqueado} className="h-12 w-full">
              <ShoppingCart className="size-4" aria-hidden />
              {puedeEnviar ? "Enviar al cliente" : "Copiar mensaje y marcar como enviado"}
            </Boton>
          </div>
          {pedidoId && <Insignia tono="gris">Borrador guardado</Insignia>}
        </div>
      )}
    </PanelLateral>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <p className={`flex justify-between gap-2 ${fuerte ? "cuerpo-fuerte" : "cuerpo"}`}>
      <span>{etiqueta}</span>
      <span>{valor}</span>
    </p>
  );
}
