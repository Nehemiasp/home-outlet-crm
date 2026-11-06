import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { db } from "@/lib/db";
import { pasarela } from "@/lib/pagos-tarjeta";
import { pasarelaSimulada } from "@/lib/pagos-tarjeta/simulada";
import { formatQ } from "@/lib/utils";
import { Botones } from "./botones";

export const metadata: Metadata = { title: "Pago con tarjeta (simulado) · Home Outlet", robots: { index: false } };
export const dynamic = "force-dynamic";

/** La página de pago de la pasarela SIMULADA. Con una pasarela real, esta página no existe: el cliente paga en la del proveedor. */
export default async function PagarSimulado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (pasarela() !== pasarelaSimulada) notFound();
  const cobro = await db.cobroTarjeta.findUnique({ where: { externoId: id }, include: { pedido: { select: { codigo: true } } } });
  if (!cobro || cobro.pasarela !== "simulada") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Logo />
      <p role="note" className="rounded-campo bg-estado-aviso-fondo p-3 meta text-estado-aviso-texto">
        Esto es una simulación para probar el sistema: no se cobra nada.
      </p>
      <section aria-label="Resumen del pago" className="flex flex-col gap-2 rounded-tarjeta border border-linea bg-superficie p-6">
        <p className="meta text-texto-suave">Pedido {cobro.pedido.codigo}</p>
        <p className="titulo-pagina">{formatQ(cobro.monto)}</p>
        {cobro.estado === "creado" ? <Botones externoId={cobro.externoId} /> : <p className="cuerpo" role="status">{cobro.estado === "pagado" ? "Pago realizado. Ya puede cerrar esta página: le avisaremos por el chat." : "El pago no se completó. Puede pedir un nuevo enlace por el chat."}</p>}
      </section>
    </main>
  );
}
