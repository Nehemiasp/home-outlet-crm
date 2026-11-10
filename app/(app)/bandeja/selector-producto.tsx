"use client";

import { SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { InsigniaExistencia } from "@/components/ui/etiquetas";
import { Boton, Buscador } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { SelectorFotos } from "@/components/ui/selector-fotos";
import type { ProductoBusqueda, ProductoDTO } from "@/lib/bandeja-tipos";
import { formatQ } from "@/lib/utils";
import { buscarProductos } from "./actions";

/**
 * Buscador del catálogo: elegir un producto lo manda al cliente como tarjeta. Si tiene más de una foto, antes se eligen cuáles
 * salen (todas marcadas); con una o ninguna, se manda directo.
 */
export function SelectorProducto({
  abierto,
  onCerrar,
  onElegir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (p: ProductoDTO, fotos: string[]) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoBusqueda[]>();
  const [conFotos, setConFotos] = useState<ProductoBusqueda | null>(null); // el producto cuyas fotos se están eligiendo
  const [fotos, setFotos] = useState<string[]>([]);

  useEffect(() => {
    if (!abierto) setConFotos(null); // al volver a abrir empieza en el buscador
  }, [abierto]);

  const enviar = (p: ProductoBusqueda) => {
    if (p.imagenes.length > 1) {
      setFotos(p.imagenes);
      setConFotos(p);
    } else onElegir(p, p.imagenes.slice(0, 1));
  };

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = setTimeout(
      () =>
        void buscarProductos(busqueda).then((r) => vigente && setResultados(r)),
      250,
    );
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [abierto, busqueda]);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={conFotos ? `Enviar ${conFotos.nombre}` : "Enviar producto"}
    >
      {conFotos ? (
        <div className="flex flex-col gap-4">
          <p className="meta text-texto-suave">
            SKU {conFotos.sku} · {formatQ(conFotos.precioCentavos)}
          </p>
          <SelectorFotos
            fotos={conFotos.imagenes}
            elegidas={fotos}
            onCambio={setFotos}
            nombre={conFotos.nombre}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setConFotos(null)}>
              Volver
            </Boton>
            <Boton
              disabled={fotos.length === 0}
              onClick={() => onElegir(conFotos, fotos)}
            >
              {fotos.length === 1
                ? "Enviar 1 foto"
                : `Enviar ${fotos.length} fotos`}
            </Boton>
          </div>
        </div>
      ) : (
        <>
          <Buscador
            autoFocus
            valor={busqueda}
            onCambio={setBusqueda}
            etiqueta="Buscar producto"
            placeholder="Nombre o SKU"
          />
          <div className="mt-4 max-h-96 overflow-y-auto">
            {resultados?.length === 0 ? (
              <EstadoVacio
                icono={SearchX}
                titulo="No hay productos con ese nombre"
                descripcion="Pruebe con otra palabra o con el SKU."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-linea">
                {(resultados ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imagenUrl ?? "/placeholder/producto.svg"}
                      alt=""
                      className="size-12 shrink-0 rounded-campo bg-fondo object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="cuerpo-fuerte truncate">{p.nombre}</p>
                      <p className="meta flex flex-wrap items-center gap-2 text-texto-suave">
                        <span>SKU {p.sku}</span>
                        <span>{formatQ(p.precioCentavos)}</span>
                        <InsigniaExistencia cantidad={p.existencia} />
                      </p>
                    </div>
                    <Boton tamano="sm" onClick={() => enviar(p)}>
                      Enviar
                    </Boton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
