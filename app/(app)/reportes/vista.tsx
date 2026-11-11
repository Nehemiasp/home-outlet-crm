"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { nombreCanal, opcionCanal } from "@/components/ui/etiquetas";
import { Boton, CampoTexto, ControlSegmentado, Selector } from "@/components/ui/form";
import { EncabezadoPagina, PestanasConContador } from "@/components/ui/estructura";
import { BarrasApiladas, BarrasHorizontales, COLOR_CANAL, TarjetaKPI, LineaAcumulada } from "@/components/ui/graficas";
import { canalesDeReporte, type Channel } from "@/lib/canales/tipos";
import { descargarCsv } from "@/lib/descarga";
import type { Reportes } from "@/lib/reportes";
import { cn, formatQ } from "@/lib/utils";
import { obtenerReportes } from "./actions";

const HORA = 3_600_000;
const hoyGt = () => new Date(Date.now() - 6 * HORA).toISOString().slice(0, 10);
const restarDias = (fecha: string, n: number) => new Date(new Date(`${fecha}T12:00:00Z`).getTime() - n * 24 * HORA).toISOString().slice(0, 10);

const duracion = (seg: number | null) => {
  if (seg === null) return "Sin datos";
  if (seg < 60) return `${Math.round(seg)} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
};
const usd = (n: number) => `US$ ${n.toFixed(2)}`;
const hora = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Tarjeta de un reporte: la gráfica, la tabla con los mismos datos (para leerlos o exportarlos) y el botón de CSV. */
function Reporte({ titulo, tabla, archivo, children }: { titulo: string; tabla: { columnas: string[]; filas: (string | number)[][] }; archivo: string; children?: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
      {children}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details className="min-w-0 flex-1">
          <summary className="cuerpo-fuerte cursor-pointer py-2 max-md:min-h-11">Ver los datos en una tabla</summary>
          <div className="max-h-72 overflow-auto rounded-campo border border-linea">
            <table className="cuerpo w-full border-collapse">
              <caption className="sr-only">{titulo}</caption>
              <thead className="sticky top-0 bg-superficie">
                <tr className="border-b border-linea text-left">
                  {tabla.columnas.map((c) => (
                    <th key={c} scope="col" className="cuerpo-fuerte px-3 py-2 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.map((f, i) => (
                  <tr key={i} className="border-b border-linea last:border-b-0">
                    {f.map((v, k) => (
                      <td key={k} className="px-3 py-1 whitespace-nowrap">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <Boton variante="secundario" tamano="sm" onClick={() => descargarCsv(archivo, [tabla.columnas, ...tabla.filas])}>
          <Download className="size-4" aria-hidden />
          Exportar CSV
        </Boton>
      </div>
    </section>
  );
}

export function VistaReportes({ inicial, verAsesores = false }: { inicial: Reportes; verAsesores?: boolean }) {
  const [pestana, setPestana] = useState<"atencion" | "ventas" | "asistente" | "asesores">("atencion");
  const [preset, setPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [desde, setDesde] = useState(inicial.rango.desde);
  const [hasta, setHasta] = useState(inicial.rango.hasta);
  const [canal, setCanal] = useState<"todos" | Channel>("todos");
  const [datos, setDatos] = useState(inicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    let vigente = true;
    setCargando(true);
    void obtenerReportes({ desde, hasta, canal }).then((r) => {
      if (!vigente) return;
      setCargando(false);
      if (r.ok) {
        setDatos(r.datos);
        setError("");
      } else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, canal]);

  const elegirPreset = (p: typeof preset) => {
    setPreset(p);
    if (p !== "custom") {
      setHasta(hoyGt());
      setDesde(restarDias(hoyGt(), Number(p) - 1));
    }
  };

  const d = datos;
  const totalPorCanal = d.canales.map((c) => ({ c, total: d.porDia.reduce((s, x) => s + (x.porCanal[c] ?? 0), 0) }));
  const diaTop = d.porDia.reduce((m, x) => (Object.values(x.porCanal).reduce((a, b) => a + b, 0) > m.n ? { n: Object.values(x.porCanal).reduce((a, b) => a + b, 0), e: x.etiqueta } : m), { n: 0, e: "" });
  const horaTop = d.porHora.indexOf(Math.max(...d.porHora));
  const costoTotal = d.costoPorDia.reduce((s, x) => s + x.costo, 0);
  const pctMes = d.costoMes.presupuesto ? Math.round((d.costoMes.gasto / d.costoMes.presupuesto) * 100) : 0;
  const ind = d.indicadores;
  const v = d.ventas;
  const vi = v.indicadores;
  const totalVentasCanal = v.canales.map((c) => ({ c, total: v.porDia.reduce((s, x) => s + (x.porCanal[c] ?? 0), 0) }));
  const diaTopVentas = v.porDia.reduce((m, x) => { const n = Object.values(x.porCanal).reduce((a, b) => a + b, 0); return n > m.n ? { n, e: x.etiqueta } : m; }, { n: 0, e: "" });
  const quetzales = (c: number) => c / 100;
  const qCorto = (n: number) => `Q${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const dias = `${d.rango.dias} ${d.rango.dias === 1 ? "día" : "días"}`;
  const asesores = d.asesores ?? [];
  const totalMensajes = asesores.reduce((s, a) => s + a.mensajes, 0);
  const ventasConAsesor = asesores.reduce((s, a) => s + a.participo.ventas, 0);
  const cerroOtro = asesores.reduce((s, a) => s + a.participo.cerroOtro, 0);
  const columnasAsesores = ["Asesor", "Mensajes escritos", "Conversaciones", "Ventas en que participó", "Monto de esas ventas (Q)", "De esas, las cerró otra persona", "Pedidos que él creó", "Monto de sus pedidos (Q)"];
  const filasAsesores = asesores.map((a) => [a.activo ? a.nombre : `${a.nombre} (desactivado)`, a.mensajes, a.conversaciones, a.participo.ventas, quetzales(a.participo.monto).toFixed(2), a.participo.cerroOtro, a.creados.ventas, quetzales(a.creados.monto).toFixed(2)]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <EncabezadoPagina titulo="Reportes" />

      {/* Rango y canal: arriba y compartidos por las tres pestañas */}
      <div className="flex flex-wrap items-end gap-3">
        <ControlSegmentado
          etiqueta="Rango de fechas"
          valor={preset}
          onCambio={elegirPreset}
          opciones={[
            { valor: "7", texto: "7 días" },
            { valor: "30", texto: "30 días" },
            { valor: "90", texto: "90 días" },
            { valor: "custom", texto: "Personalizado" },
          ]}
        />
        {preset === "custom" && (
          <>
            <CampoTexto etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
            <CampoTexto etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyGt()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </>
        )}
        <div className="w-48">
          <Selector etiqueta="Canal" value={canal} onCambio={(v) => setCanal(v as typeof canal)} opciones={[{ valor: "todos", texto: "Todos" }, ...canalesDeReporte().map(opcionCanal)]} />
        </div>
        {cargando && <span role="status" className="meta pb-3 text-texto-suave">Actualizando…</span>}
      </div>
      {error && (
        <p role="alert" className="cuerpo rounded-campo bg-error-suave p-3 text-error">
          {error}
        </p>
      )}

      <PestanasConContador
        etiqueta="Secciones de reportes"
        activa={pestana}
        onCambio={(id) => setPestana(id as typeof pestana)}
        pestanas={[
          { id: "atencion", texto: "Atención" },
          { id: "ventas", texto: "Ventas" },
          { id: "asistente", texto: "Asistente" },
          ...(verAsesores ? [{ id: "asesores", texto: "Asesores" }] : []),
        ]}
      />

      <div role="tabpanel" aria-labelledby={`pestana-${pestana}`} className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
        {pestana === "atencion" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TarjetaKPI etiqueta="Conversaciones nuevas" valor={String(ind.nuevas)} contexto={`En ${dias}`} />
              <TarjetaKPI etiqueta="Primera respuesta del asistente (mediana)" valor={duracion(ind.medianaAsistenteSeg)} contexto={`Asesores: ${duracion(ind.medianaAsesorSeg)}`} />
              <TarjetaKPI etiqueta="Resuelto por el asistente" valor={ind.resueltasPct === null ? "Sin datos" : `${ind.resueltasPct} %`} contexto={`Sin pasar a asesor, de ${ind.atendidasPorAsistente}`} />
              <TarjetaKPI etiqueta="Esperando asesor ahora" valor={String(ind.esperandoAhora)} alerta={ind.esperandoAhora > 0} contexto="Conversaciones sin atender" />
            </div>

            <Reporte
              titulo="Conversaciones por día y canal"
              archivo={`conversaciones-por-dia-${d.rango.desde}-${d.rango.hasta}`}
              tabla={{ columnas: ["Fecha", ...d.canales.map(nombreCanal), "Total"], filas: d.porDia.map((x) => [x.fecha, ...d.canales.map((c) => x.porCanal[c] ?? 0), Object.values(x.porCanal).reduce((a, b) => a + b, 0)]) }}
            >
              <BarrasApiladas
                titulo="Conversaciones por día y canal"
                unidad="conversaciones nuevas por día"
                etiquetas={d.porDia.map((x) => x.etiqueta)}
                series={d.canales.map((c) => ({ nombre: nombreCanal(c), color: COLOR_CANAL[c], valores: d.porDia.map((x) => x.porCanal[c] ?? 0) }))}
                resumen={`${ind.nuevas} conversaciones nuevas en ${d.rango.dias} días. ${totalPorCanal.map((t) => `${nombreCanal(t.c)}: ${t.total}`).join(", ")}. El día con más movimiento fue el ${diaTop.e}, con ${diaTop.n}.`}
              />
            </Reporte>

            <div className="grid gap-4 xl:grid-cols-2">
              <Reporte titulo="Motivos más frecuentes" archivo={`motivos-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: ["Motivo", "Conversaciones"], filas: d.motivos.map((m) => [m.etiqueta, m.total]) }}>
                <BarrasHorizontales
                  titulo="Motivos más frecuentes"
                  unidad="conversaciones"
                  destacarMaximo
                  datos={d.motivos.map((m) => ({ etiqueta: m.etiqueta, valor: m.total }))}
                  resumen={`Motivos más frecuentes: ${d.motivos.slice(0, 3).map((m) => `${m.etiqueta} (${m.total})`).join(", ")}.`}
                />
              </Reporte>

              <Reporte titulo="Mensajes de clientes por hora del día" archivo={`mensajes-por-hora-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: ["Hora", "Mensajes"], filas: d.porHora.map((n, h) => [hora(h), n]) }}>
                <BarrasApiladas
                  titulo="Mensajes de clientes por hora del día"
                  unidad="mensajes recibidos (hora de Guatemala)"
                  etiquetas={d.porHora.map((_, h) => String(h))}
                  series={[{ nombre: "Mensajes", color: "var(--carbon)", valores: d.porHora }]}
                  destacarMaximo
                  resumen={`Se recibieron ${d.porHora.reduce((a, b) => a + b, 0)} mensajes. La hora con más mensajes es las ${hora(horaTop)}, con ${d.porHora[horaTop]}.`}
                />
              </Reporte>
            </div>

            <section aria-label="Productos más consultados" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="cuerpo-fuerte">Productos más consultados</h2>
                <span className="meta text-texto-suave">consultas del asistente y tarjetas enviadas</span>
              </div>
              {d.productos.length === 0 ? (
                <p className="cuerpo text-texto-suave">No hay consultas de productos en este rango.</p>
              ) : (
                <div tabIndex={0} role="region" aria-label="Tabla de productos más consultados" className="relative overflow-x-auto rounded-campo border border-linea">
                  <table className="cuerpo w-full border-collapse">
                    <caption className="sr-only">Productos más consultados</caption>
                    <thead>
                      <tr className="border-b border-linea text-left">
                        <th scope="col" className="cuerpo-fuerte px-3 py-2">Producto</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Consultas</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Existencia actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.productos.map((p) => (
                        <tr key={p.id} className="border-b border-linea last:border-b-0">
                          <td className="px-3 py-2">{p.nombre}</td>
                          <td className="cuerpo-fuerte px-3 py-2 text-right tabular-nums">{p.consultas}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", p.existencia === 0 && "text-estado-peligro-texto")}>{p.existencia === 0 ? "Sin existencia" : p.existencia}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Boton variante="secundario" tamano="sm" className="self-start" onClick={() => descargarCsv(`productos-consultados-${d.rango.desde}-${d.rango.hasta}`, [["Producto", "Consultas", "Existencia actual"], ...d.productos.map((p) => [p.nombre, p.consultas, p.existencia])])}>
                <Download className="size-4" aria-hidden />
                Exportar CSV
              </Boton>
            </section>
          </>
        )}

        {pestana === "ventas" && (
          <>
            <p className="meta text-texto-suave">Una venta cuenta el día en que se confirmó su pago. Los pedidos cancelados o vencidos no cuentan.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TarjetaKPI etiqueta="Ventas confirmadas" valor={formatQ(vi.ventas)} contexto="Pedidos con el pago verificado" />
              <TarjetaKPI etiqueta="Pedidos creados" valor={String(vi.pedidos)} contexto={`En ${dias}, sin borradores`} />
              <TarjetaKPI etiqueta="Ticket promedio" valor={vi.ticketPromedio === null ? "Sin datos" : formatQ(vi.ticketPromedio)} contexto="Por pedido pagado" />
              <TarjetaKPI etiqueta="Conversaciones con pedido" valor={vi.conversionPct === null ? "Sin datos" : `${vi.conversionPct} %`} contexto={`De ${ind.nuevas} conversaciones nuevas`} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TarjetaKPI etiqueta="Pagos por verificar ahora" valor={String(vi.porVerificar)} alerta={vi.porVerificar > 0} contexto="Comprobantes en revisión" />
              <TarjetaKPI etiqueta="Pedidos vencidos" valor={String(vi.vencidos)} alerta={vi.vencidos > 0} contexto="Reserva terminada sin pago" />
              <TarjetaKPI etiqueta="Tiempo para confirmar un pago" valor={duracion(vi.medianaVerificacionSeg)} contexto="Mediana, desde el comprobante" />
            </div>

            <Reporte
              titulo="Ventas por día y canal"
              archivo={`ventas-por-dia-${d.rango.desde}-${d.rango.hasta}`}
              tabla={{ columnas: ["Fecha", ...v.canales.map(nombreCanal), "Total (Q)"], filas: v.porDia.map((x) => [x.fecha, ...v.canales.map((c) => quetzales(x.porCanal[c] ?? 0).toFixed(2)), quetzales(Object.values(x.porCanal).reduce((a, b) => a + b, 0)).toFixed(2)]) }}
            >
              <BarrasApiladas
                titulo="Ventas por día y canal"
                unidad="quetzales confirmados por día"
                etiquetas={v.porDia.map((x) => x.etiqueta)}
                series={v.canales.map((c) => ({ nombre: nombreCanal(c), color: COLOR_CANAL[c], valores: v.porDia.map((x) => quetzales(x.porCanal[c] ?? 0)) }))}
                formato={qCorto}
                resumen={vi.ventas === 0 ? "No hay ventas confirmadas en este rango." : `${formatQ(vi.ventas)} en ventas confirmadas en ${d.rango.dias} días. ${totalVentasCanal.map((t) => `${nombreCanal(t.c)}: ${formatQ(t.total)}`).join(", ")}. El día con más ventas fue el ${diaTopVentas.e}, con ${formatQ(diaTopVentas.n)}.`}
              />
            </Reporte>

            <div className="grid gap-4 xl:grid-cols-2">
              <Reporte titulo="Pedidos por estado" archivo={`pedidos-por-estado-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: ["Estado", "Pedidos"], filas: v.porEstado.map((x) => [x.etiqueta, x.total]) }}>
                <BarrasHorizontales
                  titulo="Pedidos por estado"
                  unidad="pedidos creados en el rango"
                  datos={v.porEstado.map((x) => ({ etiqueta: x.etiqueta, valor: x.total }))}
                  resumen={vi.pedidos === 0 ? "No hay pedidos en este rango." : `${vi.pedidos} pedidos. ${v.porEstado.slice(0, 3).map((x) => `${x.etiqueta}: ${x.total}`).join(", ")}.`}
                />
              </Reporte>

              <Reporte titulo="Productos más vendidos" archivo={`productos-vendidos-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: ["Producto", "Unidades", "Monto (Q)"], filas: v.productos.map((p) => [p.nombre, p.unidades, quetzales(p.monto).toFixed(2)]) }}>
                <BarrasHorizontales
                  titulo="Productos más vendidos"
                  unidad="unidades vendidas"
                  destacarMaximo
                  datos={v.productos.map((p) => ({ etiqueta: p.nombre, valor: p.unidades }))}
                  resumen={v.productos.length === 0 ? "No hay productos vendidos en este rango." : `Los más vendidos: ${v.productos.slice(0, 3).map((p) => `${p.nombre} (${p.unidades})`).join(", ")}.`}
                />
              </Reporte>
            </div>
          </>
        )}

        {pestana === "asesores" && verAsesores && (
          <>
            <p className="meta max-w-3xl text-texto-suave">
              Solo lo ve el administrador. Cuenta a los asesores (rol agente); oficina, jefes de tienda y administradores no aparecen. Los mensajes son los que el asesor le escribió al cliente: no cuentan el asistente, las notas internas ni los resúmenes y avisos automáticos de pedidos. Una venta cuenta para cada asesor que le escribió al cliente antes de que se confirmara el pago, aunque el pedido lo haya creado otra persona.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TarjetaKPI etiqueta="Mensajes de asesores" valor={String(totalMensajes)} contexto={`En ${dias}`} />
              <TarjetaKPI etiqueta="Ventas con un asesor en la conversación" valor={String(ventasConAsesor)} contexto="Suma por asesor: una venta puede contar para dos" />
              <TarjetaKPI etiqueta="Las cerró otra persona" valor={String(cerroOtro)} contexto="El pedido lo creó oficina, un jefe u otro asesor" />
            </div>

            <section aria-label="Asesores" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
              <h2 className="cuerpo-fuerte">Lo que hizo cada asesor</h2>
              {asesores.length === 0 ? (
                <p className="cuerpo text-texto-suave">No hay asesores con el rol agente.</p>
              ) : (
                <div tabIndex={0} role="region" aria-label="Tabla de asesores" className="relative overflow-x-auto rounded-campo border border-linea">
                  <table className="cuerpo w-full border-collapse">
                    <caption className="sr-only">Lo que hizo cada asesor</caption>
                    <thead>
                      <tr className="border-b border-linea text-left">
                        <th scope="col" className="cuerpo-fuerte px-3 py-2">Asesor</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Mensajes escritos</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Conversaciones</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Ventas en que participó</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Las cerró otra persona</th>
                        <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Pedidos que él creó</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asesores.map((a) => (
                        <tr key={a.id} className="border-b border-linea last:border-b-0">
                          <td className="px-3 py-2">
                            {a.nombre}
                            {!a.activo && <span className="meta text-texto-suave"> · desactivado</span>}
                          </td>
                          <td className="cuerpo-fuerte px-3 py-2 text-right tabular-nums">{a.mensajes}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.conversaciones}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {a.participo.ventas}
                            {a.participo.ventas > 0 && <span className="meta text-texto-suave"> · {formatQ(a.participo.monto)}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.participo.cerroOtro}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {a.creados.ventas}
                            {a.creados.ventas > 0 && <span className="meta text-texto-suave"> · {formatQ(a.creados.monto)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Boton variante="secundario" tamano="sm" className="self-start" onClick={() => descargarCsv(`asesores-${d.rango.desde}-${d.rango.hasta}`, [columnasAsesores, ...filasAsesores])}>
                <Download className="size-4" aria-hidden />
                Exportar CSV
              </Boton>
            </section>

            {asesores.length > 0 && (
              <Reporte titulo="Mensajes escritos por asesor" archivo={`mensajes-por-asesor-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: columnasAsesores, filas: filasAsesores }}>
                <BarrasHorizontales
                  titulo="Mensajes escritos por asesor"
                  unidad="mensajes a clientes"
                  destacarMaximo
                  datos={asesores.map((a) => ({ etiqueta: a.nombre, valor: a.mensajes }))}
                  resumen={totalMensajes === 0 ? "Ningún asesor escribió mensajes en este rango." : `Los asesores escribieron ${totalMensajes} mensajes. ${asesores.slice(0, 3).map((a) => `${a.nombre}: ${a.mensajes}`).join(", ")}.`}
                />
              </Reporte>
            )}
          </>
        )}

        {pestana === "asistente" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TarjetaKPI etiqueta="Costo en el rango" valor={usd(costoTotal)} contexto={`En ${dias}`} />
              <TarjetaKPI etiqueta="Costo del mes" valor={usd(d.costoMes.gasto)} contexto={d.costoMes.mes} />
              <TarjetaKPI etiqueta="Presupuesto del mes" valor={usd(d.costoMes.presupuesto)} contexto="Tope de gasto del asistente" />
              <TarjetaKPI etiqueta="Presupuesto usado" valor={`${pctMes} %`} alerta={pctMes >= 80} contexto={pctMes >= 100 ? "El asistente se apaga" : "Del mes en curso"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Reporte titulo="Costo del asistente por día" archivo={`costo-ia-por-dia-${d.rango.desde}-${d.rango.hasta}`} tabla={{ columnas: ["Fecha", "Costo (USD)"], filas: d.costoPorDia.map((x) => [x.fecha, x.costo.toFixed(4)]) }}>
                <BarrasApiladas
                  titulo="Costo del asistente por día"
                  unidad="dólares (US$) por día"
                  etiquetas={d.costoPorDia.map((x) => x.etiqueta)}
                  series={[{ nombre: "Costo", color: "var(--carbon)", valores: d.costoPorDia.map((x) => x.costo) }]}
                  destacarMaximo
                  formato={(n) => `US$ ${n.toFixed(2)}`}
                  resumen={`El asistente costó ${usd(costoTotal)} en el rango elegido.`}
                />
              </Reporte>

              <Reporte titulo="Costo acumulado del mes contra el presupuesto" archivo={`costo-ia-mes-${d.costoMes.mes}`} tabla={{ columnas: ["Fecha", "Acumulado (USD)", "Presupuesto (USD)"], filas: d.costoMes.dias.map((x) => [x.fecha, x.acumulado.toFixed(4), d.costoMes.presupuesto.toFixed(2)]) }}>
                <LineaAcumulada
                  titulo="Costo acumulado del mes contra el presupuesto"
                  unidad={`dólares (US$) · ${d.costoMes.mes}`}
                  etiquetas={d.costoMes.dias.map((x) => x.etiqueta)}
                  valores={d.costoMes.dias.map((x) => x.acumulado)}
                  limite={d.costoMes.presupuesto}
                  resumen={`En ${d.costoMes.mes} el asistente lleva ${usd(d.costoMes.gasto)} de ${usd(d.costoMes.presupuesto)} de presupuesto (${pctMes} %).`}
                />
              </Reporte>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
