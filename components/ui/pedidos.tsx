import Link from "next/link";
import type { Compras } from "@/lib/pedidos/compras";
import { formatQ } from "@/lib/utils";
import { InsigniaEstado } from "./etiquetas";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guatemala" });

/** Bloque «Compras» de la ficha del contacto: cuántos pedidos, cuánto ha comprado y la lista. */
export function ListaCompras({ compras, resumen = true }: { compras: Compras; /** Mostrar «N pedidos · Total comprado» arriba de la lista (la ficha de la bandeja lo pone aparte). */ resumen?: boolean }) {
  if (compras.cantidad === 0) return <p className="cuerpo rounded-tarjeta border border-dashed border-linea p-4 text-texto-suave">Este cliente todavía no tiene pedidos.</p>;
  return (
    <div className="flex flex-col gap-3">
      {resumen && (
      <p className="cuerpo flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <strong>{compras.cantidad}</strong> {compras.cantidad === 1 ? "pedido" : "pedidos"}
        </span>
        <span>
          Total comprado: <strong>{formatQ(compras.totalComprado)}</strong>
        </span>
      </p>
      )}
      <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
        {compras.pedidos.map((p) => (
          <li key={p.id}>
            <Link href={`/pedidos/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-fondo max-md:min-h-11">
              <span className="cuerpo-fuerte">{p.codigo}</span>
              <InsigniaEstado estado={p.estado} />
              <span className="meta text-texto-suave">{fecha(p.fecha)}</span>
              <span className="cuerpo-fuerte ml-auto">{formatQ(p.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El pago repetido en otro pedido: un enlace al pedido, o solo «otro pedido» si la persona no puede abrirlo (es de otro asesor). */
export function EnlaceDuplicado({ d }: { d: { pedidoId: string | null; codigo: string | null } }) {
  if (!d.pedidoId || !d.codigo) return <span>otro pedido</span>;
  return (
    <Link href={`/pedidos/${d.pedidoId}`} className="underline">
      {d.codigo}
    </Link>
  );
}
