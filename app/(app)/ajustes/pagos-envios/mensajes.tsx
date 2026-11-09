"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaTexto, Boton, Interruptor } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ConfigMensajes } from "@/lib/pedidos/avisos";
import { CLAVES_MENSAJE, MENSAJES } from "@/lib/pedidos/mensajes";
import { guardarMensajesPedidos } from "../actions";

const VARIABLES = ["codigo", "total", "saldo", "cuentas", "direccion", "horario", "guia", "horas", "motivo", "vence"];

/** Lo que se le manda al cliente en cada paso del pedido: se puede editar y apagar uno por uno. */
export function Mensajes({ inicial }: { inicial: ConfigMensajes }) {
  const router = useRouter();
  const avisar = useToast();
  const [d, setD] = useState(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const r = await guardarMensajesPedidos(d);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Mensajes guardados");
    router.refresh();
  };

  return (
    <form onSubmit={guardar} aria-labelledby="t-mensajes" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
      <div>
        <h2 id="t-mensajes" className="titulo-panel">Mensajes al cliente</h2>
        <p className="cuerpo max-w-2xl text-texto-suave">
          Se mandan solos por el canal de la conversación. Puede usar{" "}
          {VARIABLES.map((v, i) => (
            <span key={v}>
              {i > 0 && ", "}
              <code className="cuerpo-fuerte">{`{${v}}`}</code>
            </span>
          ))}
          . Si el canal no permite enviar, el sistema le muestra el texto para que lo copie.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-linea">
        {CLAVES_MENSAJE.map((k) => (
          <li key={k} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Interruptor etiqueta={MENSAJES[k].titulo} activo={d[k].activo} onCambio={(a) => setD({ ...d, [k]: { ...d[k], activo: a } })} />
              {d[k].texto !== MENSAJES[k].texto && (
                <Boton variante="fantasma" tamano="sm" onClick={() => setD({ ...d, [k]: { ...d[k], texto: MENSAJES[k].texto } })}>
                  Restablecer texto
                </Boton>
              )}
            </div>
            <AreaTexto etiqueta={`Texto de «${MENSAJES[k].titulo}»`} maxLength={1000} rows={k === "resumen" ? 6 : 3} value={d[k].texto} onChange={(e) => setD({ ...d, [k]: { ...d[k], texto: e.target.value } })} disabled={!d[k].activo} />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="meta text-error">
          {error}
        </p>
      )}
      <Boton type="submit" cargando={guardando} className="self-start">
        Guardar mensajes
      </Boton>
    </form>
  );
}
