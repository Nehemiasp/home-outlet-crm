import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { redirect } from "next/navigation";
import { BotonImprimir } from "@/app/(app)/pedidos/[id]/bodega/imprimir";
import { EstadoVacio } from "@/components/ui/estados";
import { listarEtiquetasEnvio, type EtiquetaEnvio } from "@/lib/pedidos/despacho";
import { puedeDespachar } from "@/lib/permisos";
import { requireConBodega } from "@/lib/session";
import { formatQ, formatTelefono } from "@/lib/utils";

export const metadata: Metadata = { title: "Etiquetas de envío · Home Outlet" };

// Hoja carta (8.5 × 11 in) con márgenes de 0.35 in: 2 columnas × 4 filas de 3.85 × 2.48 in, con 0.1 in entre etiquetas.
const POR_HOJA = 8;
/** Productos que se listan en una etiqueta; si hay más, se dice cuántos faltan (el total siempre es el del pedido). */
const MAX_LINEAS = 4;

/**
 * Etiquetas de envío: los pedidos «pendientes de envío» (empacados y con la paquetería elegida, o entrega propia), varias por
 * hoja, para identificar los paquetes al despacharlos. Llevan precios y el total (decisión de Nehemias): la abre también bodega. No es la guía de la paquetería.
 */
export default async function Etiquetas() {
  const usuario = await requireConBodega();
  if (!puedeDespachar(usuario)) redirect("/bandeja"); // un asesor no entra aquí
  const etiquetas = await listarEtiquetasEnvio();
  const hojas: EtiquetaEnvio[][] = [];
  for (let i = 0; i < etiquetas.length; i += POR_HOJA) hojas.push(etiquetas.slice(i, i + POR_HOJA));

  return (
    <div className="flex flex-col gap-6 p-6 print:block print:p-0">
      {/* Al imprimir: hoja carta y fondo blanco (el gris de la app no debe salir en el papel). */}
      <style>{"@page { size: letter; margin: 0.35in; } @media print { html, body, main { background: #fff !important; } }"}</style>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="titulo-pagina">Etiquetas de envío</h1>
          <p className="meta mt-1 max-w-2xl text-texto-suave">
            {etiquetas.length === 1 ? "1 pedido pendiente" : `${etiquetas.length} pedidos pendientes`} de envío · {POR_HOJA} por hoja carta{hojas.length > 1 ? ` · ${hojas.length} hojas` : ""}.
            Sirven para identificar los paquetes; no son la guía de la paquetería.
          </p>
        </div>
        {etiquetas.length > 0 && <BotonImprimir />}
      </div>

      {etiquetas.length === 0 ? (
        <EstadoVacio icono={Truck} titulo="No hay pedidos pendientes de envío" descripcion="Aparecen aquí cuando en Despacho un pedido empacado se pasa a «Pendiente de envío» y se elige por dónde sale." />
      ) : (
        hojas.map((hoja, i) => (
          <section
            key={i}
            aria-label={`Hoja ${i + 1}`}
            className="mx-auto grid w-[7.8in] grid-cols-2 gap-[0.1in] bg-superficie [grid-auto-rows:2.48in] print:mx-0 print:break-after-page print:last:break-after-auto"
          >
            {hoja.map((e) => (
              <Etiqueta key={e.id} e={e} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function Etiqueta({ e }: { e: EtiquetaEnvio }) {
  const visibles = e.lineas.slice(0, MAX_LINEAS);
  const ocultas = e.lineas.length - visibles.length;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[0.08in] border border-dashed border-carbon p-[0.12in] text-[10.5px] leading-snug text-texto [break-inside:avoid]">
      <header className="flex items-baseline justify-between gap-2 border-b border-carbon pb-1">
        <span className="text-[13px] font-bold">{e.codigo}</span>
        <span className="truncate font-semibold uppercase">{e.paqueteria ?? "Entrega propia"}</span>
      </header>

      <div className="mt-1">
        <p className="truncate text-[12px] font-bold">{e.cliente}</p>
        {e.telefono && <p className="font-semibold">Tel. {formatTelefono(e.telefono)}</p>}
        {e.direccion && <p className="line-clamp-2">{e.direccion}</p>}
        <p className="truncate font-semibold">
          {e.lugar}
          {e.zona ? ` · ${e.zona}` : ""}
        </p>
      </div>

      <ul className="mt-1 flex min-h-0 flex-1 flex-col border-t border-linea pt-1">
        {visibles.map((l, k) => (
          <li key={k} className="flex justify-between gap-2">
            <span className="truncate">
              {l.cantidad}× {l.nombre}
            </span>
            <span className="shrink-0 tabular-nums">{formatQ(l.precio * l.cantidad)}</span>
          </li>
        ))}
        {ocultas > 0 && <li className="text-texto-suave">+{ocultas === 1 ? "1 producto más" : `${ocultas} productos más`}</li>}
      </ul>

      <footer className="flex items-baseline justify-between gap-2 border-t border-carbon pt-1">
        <span className="truncate text-texto-suave">
          {e.costoEnvio > 0 ? `Envío ${formatQ(e.costoEnvio)}` : "Envío gratis"}
          {e.descuento > 0 ? ` · Desc. −${formatQ(e.descuento)}` : ""}
        </span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums">Total {formatQ(e.total)}</span>
      </footer>
    </article>
  );
}
