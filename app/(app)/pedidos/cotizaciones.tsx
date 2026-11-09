"use client";

import { FileText, SearchX, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio, Esqueleto } from "@/components/ui/estados";
import { InsigniaCotizacion } from "@/components/ui/etiquetas";
import { Boton } from "@/components/ui/form";
import { enlaceTabla, Tabla } from "@/components/ui/estructura";
import type { FilaCotizacion } from "@/lib/pedidos/cotizaciones";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatQ } from "@/lib/utils";
import { listarCotizacionesDePedidos } from "./actions";

const POR_PAGINA = 30;
const fecha = (iso: string) => new Date(iso).toLocaleString("es-GT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", timeZone: "America/Guatemala" });

/** La pestaña «Cotizaciones» de Pedidos: solo la búsqueda de arriba; los filtros de pedidos no aplican. */
export function ListaCotizaciones({ q }: { q: string }) {
  const router = useRouter();
  const [limite, setLimite] = useState(POR_PAGINA);
  const { datos, fallo, refrescar } = useActualizacion(`cotizaciones-${q}-${limite}`, () => listarCotizacionesDePedidos({ q, limite }), 10_000);

  if (!datos && fallo) return <EstadoVacio icono={WifiOff} titulo="No pudimos cargar las cotizaciones" descripcion="Revise su conexión. Se volverá a intentar solo." accion={<Boton variante="secundario" onClick={refrescar}>Reintentar</Boton>} />;
  if (!datos)
    return (
      <div className="flex flex-col gap-2" aria-label="Cargando">
        <Esqueleto className="h-12" />
        <Esqueleto className="h-12" />
        <Esqueleto className="h-12" />
      </div>
    );
  if (datos.items.length === 0)
    return q ? (
      <EstadoVacio icono={SearchX} titulo="No hay cotizaciones con esa búsqueda" descripcion="Pruebe con el código, el nombre o el teléfono del cliente." />
    ) : (
      <EstadoVacio icono={FileText} titulo="Todavía no hay cotizaciones" descripcion="Arme una desde una conversación: «Crear pedido» → «Enviar cotización»." />
    );

  return (
    <>
      <Tabla<FilaCotizacion>
        descripcion="Cotizaciones, de la más reciente a la más antigua"
        filas={datos.items}
        idFila={(c) => c.id}
        alActivar={(c) => router.push(`/pedidos/cotizaciones/${c.id}`)}
        pagina={1}
        totalPaginas={1}
        onPagina={() => {}}
        columnas={[
          { clave: "codigo", titulo: "Código", render: (c) => <Link href={`/pedidos/cotizaciones/${c.id}`} className={`${enlaceTabla} whitespace-nowrap max-md:inline-block max-md:min-h-11 max-md:leading-11`}>{c.codigo}</Link> },
          { clave: "cliente", titulo: "Cliente", render: (c) => <Link href={`/contactos/${c.contactoId}`} className={enlaceTabla}>{c.cliente}</Link> },
          { clave: "fecha", titulo: "Fecha", ocultarMovil: true, render: (c) => <span className="whitespace-nowrap">{fecha(c.fecha)}</span> },
          { clave: "vence", titulo: "Vale hasta", ocultarMovil: true, render: (c) => <span className="whitespace-nowrap">{dia(c.validaHasta)}</span> },
          {
            clave: "estado",
            titulo: "Estado",
            render: (c) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                <InsigniaCotizacion estado={c.estado} />
                {c.pedido && (
                  <Link href={`/pedidos/${c.pedido.id}`} className={`${enlaceTabla} meta whitespace-nowrap`}>
                    {c.pedido.codigo}
                  </Link>
                )}
              </span>
            ),
          },
          { clave: "total", titulo: "Total", alinear: "der", render: (c) => <span className="cuerpo-fuerte whitespace-nowrap">{formatQ(c.total)}</span> },
        ]}
      />
      {datos.hayMas && (
        <div className="mt-4">
          <Boton variante="secundario" onClick={() => setLimite((l) => l + POR_PAGINA)}>
            Cargar más cotizaciones
          </Boton>
        </div>
      )}
    </>
  );
}
