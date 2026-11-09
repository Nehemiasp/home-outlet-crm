"use client";

import { SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { InsigniaExistencia } from "@/components/ui/etiquetas";
import { Boton, Buscador } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import type { ProductoBusqueda, ProductoDTO } from "@/lib/bandeja-tipos";
import { formatQ } from "@/lib/utils";
import { buscarProductos } from "./actions";

/** Buscador del catálogo: elegir un producto lo manda al cliente como tarjeta. */
export function SelectorProducto({ abierto, onCerrar, onElegir }: { abierto: boolean; onCerrar: () => void; onElegir: (p: ProductoDTO) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoBusqueda[]>();

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = setTimeout(() => void buscarProductos(busqueda).then((r) => vigente && setResultados(r)), 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [abierto, busqueda]);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Enviar producto">
      <Buscador autoFocus valor={busqueda} onCambio={setBusqueda} etiqueta="Buscar producto" placeholder="Nombre o SKU" />
      <div className="mt-4 max-h-96 overflow-y-auto">
        {resultados?.length === 0 ? (
          <EstadoVacio icono={SearchX} titulo="No hay productos con ese nombre" descripcion="Pruebe con otra palabra o con el SKU." />
        ) : (
          <ul className="flex flex-col divide-y divide-linea">
            {(resultados ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imagenUrl ?? "/placeholder/producto.svg"} alt="" className="size-12 shrink-0 rounded-campo bg-fondo object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="cuerpo-fuerte truncate">{p.nombre}</p>
                  <p className="meta flex flex-wrap items-center gap-2 text-texto-suave">
                    <span>SKU {p.sku}</span>
                    <span>{formatQ(p.precioCentavos)}</span>
                    <InsigniaExistencia cantidad={p.existencia} />
                  </p>
                </div>
                <Boton tamano="sm" onClick={() => onElegir(p)}>
                  Enviar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
