import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { InsigniaCotizacion } from "@/components/ui/etiquetas";
import { enlaceTabla } from "@/components/ui/estructura";
import { textoLugar } from "@/lib/guatemala";
import { detalleCotizacion } from "@/lib/pedidos/cotizaciones";
import { textoFecha } from "@/lib/pedidos/vigencia";
import { requireUsuario } from "@/lib/session";
import { formatQ, formatTelefono } from "@/lib/utils";
import { puedeVerConversacion } from "@/lib/visibilidad";
import { AccionesCotizacion } from "./acciones";

export const metadata: Metadata = { title: "Cotización · Home Outlet" };

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guatemala" });

/** Una cotización: arriba lo que hace el equipo (no se imprime) y abajo el documento para el cliente, listo para imprimir o guardar en PDF. */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUsuario();
  const c = await detalleCotizacion(id, u);
  if (!c) notFound();
  const convertible = c.estado !== "aceptada" && !c.pedido && !!c.conversacionId && (await puedeVerConversacion(u, c.conversacionId));
  const vence = textoFecha(new Date(c.validaHasta));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 print:max-w-none print:p-0">
      <div className="flex flex-col gap-4 print:hidden">
        <Link href="/pedidos?vista=cotizaciones" className="cuerpo-fuerte inline-flex items-center gap-2 self-start text-texto hover:underline max-md:min-h-11">
          <ArrowLeft className="size-4" aria-hidden />
          Cotizaciones
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <InsigniaCotizacion estado={c.estado} />
            <span className="meta text-texto-suave">
              {c.creadoPor ? `Hecha por ${c.creadoPor}` : "Hecha por el equipo"}
              {c.pedido && (
                <>
                  {" · Pedido "}
                  <Link href={`/pedidos/${c.pedido.id}`} className={enlaceTabla}>
                    {c.pedido.codigo}
                  </Link>
                </>
              )}
              {c.conversacionId && (
                <>
                  {" · "}
                  <Link href={`/bandeja/${c.conversacionId}`} className={enlaceTabla}>
                    Ver conversación
                  </Link>
                </>
              )}
            </span>
          </div>
          <AccionesCotizacion texto={c.texto} convertir={convertible ? `/bandeja/${c.conversacionId}?cotizacion=${c.id}` : null} />
        </div>
        {c.estado === "vencida" && !c.pedido && <p className="meta rounded-campo bg-fondo p-3 text-texto-suave">Esta cotización ya venció. Si la convierte en pedido, lleva los precios de hoy.</p>}
        {c.notas && (
          <section aria-label="Notas del equipo" className="cuerpo rounded-campo border border-linea p-3">
            <p className="cuerpo-fuerte">Notas (solo el equipo)</p>
            <p className="whitespace-pre-wrap">{c.notas}</p>
          </section>
        )}
      </div>

      {/* El documento que ve el cliente: sin estados internos, notas ni datos del equipo. */}
      <article aria-label={`Cotización ${c.codigo}`} className="flex flex-col gap-6 rounded-tarjeta border border-linea bg-superficie p-6 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-carbon pb-4">
          <div className="flex flex-col gap-2">
            <Logo />
            <div className="meta text-texto-suave">
              <p>{c.negocio.nombre}</p>
              {c.negocio.direccion && <p>{c.negocio.direccion}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="titulo-pagina">Cotización</h1>
            <p className="cuerpo-fuerte">{c.codigo}</p>
            <p className="meta text-texto-suave">Fecha: {fecha(c.creada)}</p>
            <p className="meta cuerpo-fuerte">Vale hasta el {vence}</p>
          </div>
        </header>

        <section aria-label="Cliente" className="cuerpo flex flex-col gap-1">
          <p className="meta text-texto-suave">Para</p>
          <p className="cuerpo-fuerte">{c.cliente.nombre}</p>
          {c.cliente.telefono && <p>Teléfono: {formatTelefono(c.cliente.telefono)}</p>}
          <p>{c.entrega === "envio" ? `Envío a ${textoLugar(c.municipio, c.departamento) || "su municipio"}` : "Recoger en tienda"}</p>
          {c.entrega === "envio" && c.direccion && <p className="whitespace-pre-wrap">Dirección: {c.direccion}</p>}
        </section>

        <section aria-label="Productos">
          <table className="cuerpo w-full border-collapse">
            <caption className="sr-only">Productos cotizados</caption>
            <thead>
              <tr className="border-b-2 border-carbon text-left">
                <th scope="col" className="cuerpo-fuerte w-20 py-2 pr-3 text-right">Cantidad</th>
                <th scope="col" className="cuerpo-fuerte py-2">Producto</th>
                <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right max-sm:hidden">Precio</th>
                <th scope="col" className="cuerpo-fuerte py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {c.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea align-top">
                  <td className="py-3 pr-3 text-right">{l.cantidad}</td>
                  <td className="py-3">
                    <span className="cuerpo-fuerte">{l.nombre}</span>
                    <span className="meta block text-texto-suave">SKU {l.sku}</span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap max-sm:hidden">{formatQ(l.precio)}</td>
                  <td className="py-3 text-right whitespace-nowrap">{formatQ(l.precio * l.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="cuerpo mt-3 ml-auto flex w-full max-w-xs flex-col gap-1">
            <Fila etiqueta="Subtotal" valor={formatQ(c.subtotal)} />
            {c.descuentoMonto > 0 && <Fila etiqueta="Descuento" valor={`-${formatQ(c.descuentoMonto)}`} />}
            {c.entrega === "envio" && <Fila etiqueta="Envío" valor={c.costoEnvio === 0 ? "Gratis" : formatQ(c.costoEnvio)} />}
            <Fila etiqueta="Total" valor={formatQ(c.total)} fuerte />
          </dl>
        </section>

        <footer className="meta flex flex-col gap-1 border-t border-linea pt-4 text-texto-suave">
          <p>Precios válidos hasta el {vence}. Los productos no quedan apartados hasta que se confirme el pedido.</p>
          {c.entrega === "recoger" && c.negocio.horario && <p>Horario de la tienda: {c.negocio.horario}</p>}
        </footer>
      </article>
    </div>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "cuerpo-fuerte border-t border-carbon pt-1" : ""}`}>
      <dt>{etiqueta}</dt>
      <dd className="whitespace-nowrap">{valor}</dd>
    </div>
  );
}
