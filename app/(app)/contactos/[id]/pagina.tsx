"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { horaLista } from "@/app/(app)/bandeja/formato";
import { ContenidoContacto } from "@/components/contacto/contenido";
import { ModalUnir } from "@/components/contacto/modal-unir";
import { InsigniaCanal, InsigniaConversacion, LogoCanal, nombreCanal, type Canal } from "@/components/ui/etiquetas";
import { Boton } from "@/components/ui/form";
import { EncabezadoPagina } from "@/components/ui/estructura";
import { TarjetaKPI } from "@/components/ui/graficas";
import { ListaCompras } from "@/components/ui/pedidos";
import type { ContactoDetalle } from "@/lib/contactos-tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatQ } from "@/lib/utils";
import { obtenerContacto } from "../actions";

const diaMes = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", timeZone: "America/Guatemala" });
const anio = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { year: "numeric", timeZone: "America/Guatemala" });

/** El canal por el que más conversaciones ha tenido; si empatan, el de la conversación más reciente. */
function canalMasUsado(conversaciones: { canal: Canal; fecha: string }[]) {
  const por = new Map<Canal, { n: number; ultima: string }>();
  for (const v of conversaciones) {
    const previo = por.get(v.canal);
    por.set(v.canal, { n: (previo?.n ?? 0) + 1, ultima: previo && previo.ultima > v.fecha ? previo.ultima : v.fecha });
  }
  const orden = [...por.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ultima.localeCompare(a[1].ultima));
  return orden[0] ? { canal: orden[0][0], n: orden[0][1].n } : null;
}

export function PaginaContacto({ inicial, puedeUnir }: { inicial: ContactoDetalle; puedeUnir: boolean }) {
  const { datos, refrescar } = useActualizacion(`contacto-${inicial.id}`, () => obtenerContacto(inicial.id), 10_000);
  const c = datos ?? inicial;
  const [unir, setUnir] = useState(false);

  const ultimoPedido = c.compras.pedidos[0];
  const canalTop = canalMasUsado(c.conversaciones);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-6">
      <Link href="/contactos" className="cuerpo-fuerte inline-flex items-center gap-2 self-start text-texto hover:underline max-md:min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Contactos
      </Link>
      <EncabezadoPagina titulo={c.nombre}>
        {puedeUnir && (
          <Boton variante="secundario" onClick={() => setUnir(true)}>
            Unir con otro contacto
          </Boton>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKPI etiqueta="Total comprado" valor={formatQ(c.compras.totalComprado)} contexto="Pedidos con el pago verificado" />
        <TarjetaKPI etiqueta="Pedidos" valor={String(c.compras.cantidad)} contexto={c.compras.cantidad === 0 ? "Todavía no tiene" : "Sin contar borradores"} />
        <TarjetaKPI
          etiqueta="Último pedido"
          valor={ultimoPedido ? diaMes(ultimoPedido.fecha) : "—"}
          contexto={ultimoPedido ? `${anio(ultimoPedido.fecha)} · ${ultimoPedido.codigo}` : "Sin pedidos"}
        />
        <TarjetaKPI
          etiqueta="Canal más usado"
          valor={canalTop ? nombreCanal(canalTop.canal) : "—"}
          contexto={
            canalTop ? (
              <span className="inline-flex items-center gap-1">
                <LogoCanal canal={canalTop.canal} />
                {canalTop.n} {canalTop.n === 1 ? "conversación" : "conversaciones"}
              </span>
            ) : (
              "Sin conversaciones"
            )
          }
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-6 rounded-tarjeta border border-linea bg-superficie p-4">
          <ContenidoContacto contacto={c} etiquetasDisponibles={c.etiquetasDisponibles} onCambio={refrescar} />
        </div>

        <div className="flex flex-col gap-6">
          <section aria-label="Conversaciones" className="rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel mb-3">Conversaciones</h2>
            {c.conversaciones.length === 0 ? (
              <p className="cuerpo text-texto-suave">Este contacto todavía no tiene conversaciones.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
                {c.conversaciones.map((v) => (
                  <li key={v.id}>
                    <Link href={`/bandeja/${v.id}`} className="flex flex-col gap-1 p-3 hover:bg-fondo">
                      <span className="flex items-center gap-2">
                        <InsigniaCanal canal={v.canal} />
                        <InsigniaConversacion estado={v.estado} />
                        <span className="meta ml-auto text-texto-suave">{horaLista(v.fecha)}</span>
                      </span>
                      <span className="cuerpo truncate text-texto-suave">{v.ultimo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Compras" className="rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel mb-3">Compras</h2>
            <ListaCompras compras={c.compras} resumen={false} />
          </section>
        </div>
      </div>

      {puedeUnir && <ModalUnir abierto={unir} onCerrar={() => setUnir(false)} conservarInicial={{ id: c.id, nombre: c.nombre, telefono: c.telefono }} onUnido={refrescar} />}
    </div>
  );
}
