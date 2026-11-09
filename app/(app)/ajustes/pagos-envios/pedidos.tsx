"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaTexto, Boton, CampoTexto, Interruptor, Selector } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { METODOS } from "@/lib/pedidos/metodos";
import { guardarAjustesDePedidos } from "../actions";

type Datos = {
  prefijo: string;
  horasReserva: string;
  diasCotizacion: string;
  /** Una por línea. */
  paqueterias: string;
  descuentoMaxAgente: string;
  inventario: "separado" | "compartido";
  metodos: string[];
  envioGratis: boolean;
  envioGratisDesde: string;
  costoContraEntrega: string;
  envioGratisSinContraEntrega: boolean;
  ubicacionRecogerId: string | null;
  ubicacionEnvioId: string | null;
};

/** Métodos de pago, reglas de los pedidos, inventario y envío gratis: se guardan juntos. */
export function AjustesDePedidos({ inicial, ubicaciones, tarjetaConectada }: { inicial: Datos; ubicaciones: { id: string; nombre: string }[]; tarjetaConectada: boolean }) {
  const router = useRouter();
  const avisar = useToast();
  const [d, setD] = useState(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const opcionesUbicacion = ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }));

  const alternar = (id: string, activo: boolean) => setD({ ...d, metodos: activo ? [...d.metodos, id] : d.metodos.filter((m) => m !== id) });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const r = await guardarAjustesDePedidos({
      prefijo: d.prefijo,
      horasReserva: Number(d.horasReserva),
      diasCotizacion: Number(d.diasCotizacion),
      paqueterias: d.paqueterias.split("\n"),
      descuentoMaxAgente: Number(d.descuentoMaxAgente),
      inventario: d.inventario,
      metodos: d.metodos,
      envioGratisDesde: d.envioGratis ? d.envioGratisDesde : "",
      costoContraEntrega: d.costoContraEntrega,
      envioGratisSinContraEntrega: d.envioGratisSinContraEntrega,
      ubicacionRecogerId: d.ubicacionRecogerId,
      ubicacionEnvioId: d.ubicacionEnvioId,
    });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Ajustes de pedidos guardados");
    router.refresh();
  };

  return (
    <form onSubmit={guardar} aria-label="Ajustes de pedidos" className="flex flex-col gap-6">
      <section aria-labelledby="t-metodos" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 id="t-metodos" className="titulo-panel">Métodos de pago</h2>
        <ul className="flex flex-col divide-y divide-linea">
          {METODOS.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <Interruptor etiqueta={m.nombre} activo={d.metodos.includes(m.id)} disabled={!m.disponible || (m.id === "tarjeta" && !tarjetaConectada && !d.metodos.includes("tarjeta"))} onCambio={(a) => alternar(m.id, a)} />
              {m.nota && !(m.id === "tarjeta" && tarjetaConectada) && <span className="meta text-texto-suave">{m.nota}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-pedidos" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 id="t-pedidos" className="titulo-panel">Pedidos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Prefijo del código" autoComplete="off" maxLength={6} ayuda="Por ejemplo HO-000123. Los pedidos ya creados no cambian." value={d.prefijo} onChange={(e) => setD({ ...d, prefijo: e.target.value })} />
          <CampoTexto etiqueta="Horas de reserva sin pago" inputMode="numeric" maxLength={3} ayuda="Pasado ese tiempo el pedido vence y libera las unidades." value={d.horasReserva} onChange={(e) => setD({ ...d, horasReserva: e.target.value.replace(/\D/g, "") })} />
          <CampoTexto etiqueta="Días que vale una cotización" inputMode="numeric" maxLength={2} ayuda="Hasta el final del último día. La cotización no aparta productos." value={d.diasCotizacion} onChange={(e) => setD({ ...d, diasCotizacion: e.target.value.replace(/\D/g, "") })} />
          <CampoTexto etiqueta="Descuento máximo del agente (%)" inputMode="numeric" maxLength={3} ayuda="Más que eso lo autoriza un administrador o un jefe de tienda (ellos no tienen tope). 0 = sin descuentos." value={d.descuentoMaxAgente} onChange={(e) => setD({ ...d, descuentoMaxAgente: e.target.value.replace(/\D/g, "") })} />
        </div>
        <AreaTexto
          etiqueta="Paqueterías (una por línea)"
          rows={4}
          maxLength={500}
          ayuda="Se eligen al marcar un pedido como enviado. Por paquetería se pide el número de guía y la guía adjunta (foto o PDF); en una entrega propia, nada."
          value={d.paqueterias}
          onChange={(e) => setD({ ...d, paqueterias: e.target.value })}
        />
      </section>

      <section aria-labelledby="t-inventario" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 id="t-inventario" className="titulo-panel">Inventario</h2>
        <Selector
          etiqueta="Cómo se manejan las existencias"
          opciones={[
            { valor: "separado", texto: "Separado: cada tienda tiene las suyas" },
            { valor: "compartido", texto: "Compartido: se suman las dos tiendas" },
          ]}
          value={d.inventario}
          onCambio={(v) => setD({ ...d, inventario: v as Datos["inventario"] })}
          ayuda={d.inventario === "separado" ? "Cada línea del pedido sale de una ubicación y solo se aparta de ahí." : "Se aparta primero de la ubicación de despacho y, si no alcanza, de la otra."}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector etiqueta="«Recoger en tienda» sale de" opciones={opcionesUbicacion} value={d.ubicacionRecogerId ?? ""} onCambio={(v) => setD({ ...d, ubicacionRecogerId: v })} />
          <Selector etiqueta="«Envío» sale de" opciones={opcionesUbicacion} value={d.ubicacionEnvioId ?? ""} onCambio={(v) => setD({ ...d, ubicacionEnvioId: v })} />
        </div>
      </section>

      <section aria-labelledby="t-gratis" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 id="t-gratis" className="titulo-panel">Costo del envío</h2>
        <CampoTexto etiqueta="Envío con pago contra entrega (Q)" inputMode="decimal" autoComplete="off" maxLength={12} className="max-w-48" ayuda="Lo que se cobra por el envío cuando el cliente paga al recibir, sin importar la zona ni el monto." value={d.costoContraEntrega} onChange={(e) => setD({ ...d, costoContraEntrega: e.target.value })} />
        <Interruptor etiqueta="Envío gratis con las demás formas de pago" activo={d.envioGratisSinContraEntrega} onCambio={(a) => setD({ ...d, envioGratisSinContraEntrega: a })} />
        <Interruptor etiqueta={d.envioGratisSinContraEntrega ? "Solo a partir de un monto" : "Envío gratis a partir de un monto"} activo={d.envioGratis} onCambio={(a) => setD({ ...d, envioGratis: a })} />
        {d.envioGratis && (
          <CampoTexto etiqueta="Monto mínimo del subtotal (Q)" inputMode="decimal" autoComplete="off" maxLength={12} className="max-w-48" value={d.envioGratisDesde} onChange={(e) => setD({ ...d, envioGratisDesde: e.target.value })} />
        )}
        <p className="meta text-texto-suave">
          {d.envioGratisSinContraEntrega
            ? d.envioGratis
              ? `Con transferencia, depósito o tarjeta el envío es gratis desde Q${d.envioGratisDesde || "…"}; en compras menores cuesta Q${d.costoContraEntrega || "…"}, lo mismo que contra entrega. Las zonas dicen a dónde se entrega y en cuánto tiempo.`
              : "Con transferencia, depósito o tarjeta el envío no se cobra. Las zonas siguen sirviendo para saber a dónde se entrega y en cuánto tiempo."
            : d.envioGratis
              ? `Con transferencia, depósito o tarjeta se cobra el costo de la zona de envío, y es gratis desde Q${d.envioGratisDesde || "…"}.`
              : "Con transferencia, depósito o tarjeta se cobra el costo de la zona de envío."}
        </p>
      </section>

      {error && (
        <p role="alert" className="meta text-error">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={guardando} className="self-start">
        Guardar ajustes de pedidos
      </Boton>
    </form>
  );
}
