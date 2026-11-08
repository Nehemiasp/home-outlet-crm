import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarHoja } from "@/lib/pedidos/despacho";
import { requireConBodega } from "@/lib/session";
import { formatTelefono } from "@/lib/utils";
import { BotonImprimir } from "./imprimir";

export const metadata: Metadata = { title: "Hoja de bodega · Home Outlet" };

export default async function Bodega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireConBodega(); // también la abre bodega, pero solo con lo de despacho (sin precios ni pagos)
  const p = await cargarHoja(id, u);
  if (!p) notFound();
  // Sin precios: es para quien empaca. Las líneas partidas por ubicación se ven cada una con su ubicación.
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="cuerpo text-texto-suave">Hoja para empacar: no lleva precios.</p>
        <BotonImprimir />
      </div>

      <header className="flex flex-col gap-1 border-b-2 border-carbon pb-3">
        <h1 className="titulo-pagina">Pedido {p.codigo}</h1>
        <p className="cuerpo-fuerte">{p.entrega === "envio" ? "ENVÍO" : "RECOGER EN TIENDA"}</p>
      </header>

      <section aria-label="Cliente" className="cuerpo flex flex-col gap-1">
        <p className="cuerpo-fuerte">{p.cliente}</p>
        {p.telefono && <p>Teléfono: {formatTelefono(p.telefono)}</p>}
        {p.entrega === "envio" && (
          <>
            {p.departamento && <p>Departamento: {p.departamento}</p>}
            <p>Municipio: {p.municipio}</p>
            {p.direccion && <p className="whitespace-pre-wrap">Dirección: {p.direccion}</p>}
            {p.guia && <p>Guía: {p.guia}</p>}
          </>
        )}
      </section>

      <section aria-label="Productos">
        <table className="cuerpo w-full border-collapse">
          <caption className="sr-only">Productos que se deben empacar</caption>
          <thead>
            <tr className="border-b-2 border-carbon text-left">
              <th scope="col" className="cuerpo-fuerte w-12 py-2">✓</th>
              <th scope="col" className="cuerpo-fuerte py-2">Producto</th>
              <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Cantidad</th>
              <th scope="col" className="cuerpo-fuerte py-2">Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {p.lineas.map((l) => (
              <tr key={l.id} className="border-b border-linea">
                <td className="py-3"><span aria-hidden className="inline-block size-5 rounded-campo border-2 border-carbon" /></td>
                <td className="py-3">
                  <span className="cuerpo-fuerte">{l.nombre}</span>
                  <span className="meta block text-texto-suave">SKU {l.sku}</span>
                </td>
                <td className="px-3 py-3 text-right text-lg font-semibold">{l.cantidad}</td>
                <td className="py-3">{l.ubicacion ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {p.notas && (
        <section aria-label="Notas" className="cuerpo rounded-campo border border-linea p-3">
          <p className="cuerpo-fuerte">Notas</p>
          <p className="whitespace-pre-wrap">{p.notas}</p>
        </section>
      )}
    </div>
  );
}
