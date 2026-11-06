import { Check, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Insignia } from "@/components/ui/etiquetas";
import { evaluarPrimerosPasos } from "@/lib/primeros-pasos";

export const metadata: Metadata = { title: "Primeros pasos · Ajustes · Home Outlet" };
export const dynamic = "force-dynamic";

export default async function PrimerosPasos() {
  const pasos = await evaluarPrimerosPasos();
  const listos = pasos.filter((p) => p.hecho).length;
  return (
    <section aria-label="Primeros pasos" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="cuerpo-fuerte" aria-live="polite">
          {listos === pasos.length ? "Todo listo" : `${listos} de ${pasos.length} pasos listos`}
        </h2>
        <p className="cuerpo mt-1 text-texto-suave">Lo que falta para trabajar con datos reales. Cada paso se marca solo cuando de verdad está hecho.</p>
      </div>
      <ol className="flex flex-col gap-2">
        {pasos.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-campo border border-linea bg-superficie p-4">
            {p.hecho ? <Check className="mt-0.5 size-5 shrink-0 text-exito" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-texto-suave" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="cuerpo-fuerte">{p.titulo}</h3>
                <Insignia estado={p.hecho ? "exito" : "aviso"}>{p.hecho ? "Listo" : "Pendiente"}</Insignia>
              </div>
              <p className="cuerpo mt-1 text-texto-suave">{p.detalle}</p>
            </div>
            {!p.hecho && p.href && (
              <Link href={p.href} className="cuerpo-fuerte inline-flex h-10 shrink-0 items-center rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo">
                {p.accion ?? "Ir"}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
