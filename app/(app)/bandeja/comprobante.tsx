"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boton, CampoTexto, Selector } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { ConversacionDTO } from "@/lib/bandeja-tipos";
import { EnlaceDuplicado } from "@/components/ui/pedidos";
import type { DuplicadoVisible } from "@/lib/visibilidad";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import { formatQ } from "@/lib/utils";
import { registrarComprobante } from "../pedidos/actions";

const hoyGT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const aQuetzales = (c: number) => (c / 100).toFixed(2);

/** Convierte la imagen que mandó el cliente en un comprobante de pago de uno de los pedidos abiertos. */
export function ComprobanteModal({ imagen, onCerrar, c, onRegistrado }: { imagen: { mensajeId: string; url: string } | null; onCerrar: () => void; c: ConversacionDTO; onRegistrado: () => void }) {
  const avisar = useToast();
  const [pedidoId, setPedidoId] = useState("");
  const [tipo, setTipo] = useState("transferencia");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyGT());
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ duplicados: DuplicadoVisible[]; aviso: ResultadoAviso } | null>(null);

  const abierto = !!imagen;
  useEffect(() => {
    if (!imagen) return;
    const primero = c.pedidosAbiertos[0];
    setPedidoId(primero?.id ?? "");
    setMonto(primero && primero.saldo > 0 ? aQuetzales(primero.saldo) : "");
    setTipo(c.comprobante.metodos[0]?.id ?? "transferencia");
    setBanco("");
    setReferencia("");
    setFecha(hoyGT());
    setError("");
    setResultado(null);
    // Se reinicia solo al abrir con otra imagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagen?.mensajeId]);

  const elegirPedido = (id: string) => {
    setPedidoId(id);
    const p = c.pedidosAbiertos.find((x) => x.id === id);
    if (p && p.saldo > 0) setMonto(aQuetzales(p.saldo));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagen) return;
    setGuardando(true);
    setError("");
    const r = await registrarComprobante({ pedidoId, tipo, banco, referencia, monto, fecha, mensajeId: imagen.mensajeId });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    onRegistrado();
    if (r.duplicados.length === 0 && r.aviso.estado !== "copiar") {
      avisar("Comprobante registrado. El pedido pasó a revisión de pago.");
      return onCerrar();
    }
    setResultado({ duplicados: r.duplicados, aviso: r.aviso });
  };

  const pedido = c.pedidosAbiertos.find((x) => x.id === pedidoId);
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Registrar como comprobante">
      {resultado ? (
        <div className="flex flex-col gap-4">
          <p className="cuerpo">Comprobante registrado. El pedido quedó en revisión de pago.</p>
          {resultado.duplicados.length > 0 && (
            <div role="alert" className="cuerpo rounded-campo bg-aviso-suave p-3 text-aviso">
              <p className="cuerpo-fuerte">Posible duplicado</p>
              <p>Ya hay un pago con el mismo banco y referencia en:</p>
              <ul className="list-disc pl-5">
                {resultado.duplicados.map((d) => (
                  <li key={d.pagoId}>
                    <EnlaceDuplicado d={d} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {resultado.aviso.estado === "copiar" && resultado.aviso.texto && (
            <div className="flex flex-col gap-2">
              <p className="cuerpo">No se pudo avisar al cliente desde aquí. Copie el mensaje y mándelo por el canal:</p>
              <textarea readOnly rows={4} aria-label="Mensaje para el cliente" value={resultado.aviso.texto} className="cuerpo w-full resize-none rounded-campo border border-texto-suave p-3" onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
          <div className="flex justify-end">
            <Boton onClick={onCerrar}>Listo</Boton>
          </div>
        </div>
      ) : (
        <form onSubmit={guardar} className="flex flex-col gap-4">
          {imagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen.url} alt="Comprobante enviado por el cliente" className="max-h-56 w-full rounded-campo border border-linea bg-fondo object-contain" />
          )}
          {c.pedidosAbiertos.length > 1 ? (
            <Selector etiqueta="Pedido" opciones={c.pedidosAbiertos.map((p) => ({ valor: p.id, texto: `${p.codigo} · falta ${formatQ(p.saldo)}` }))} value={pedidoId} onCambio={elegirPedido} />
          ) : (
            pedido && (
              <p className="cuerpo">
                Pedido <strong>{pedido.codigo}</strong> · total {formatQ(pedido.total)} · falta {formatQ(pedido.saldo)}
              </p>
            )
          )}
          <Selector etiqueta="Método" opciones={c.comprobante.metodos.map((m) => ({ valor: m.id, texto: m.nombre }))} value={tipo} onCambio={setTipo} />
          <CampoTexto etiqueta="Banco" autoComplete="off" maxLength={60} list="bancos-comprobante" value={banco} onChange={(e) => setBanco(e.target.value)} />
          <datalist id="bancos-comprobante">
            {c.comprobante.bancos.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <CampoTexto etiqueta="Referencia o número de boleta" autoComplete="off" maxLength={60} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Monto (Q)" inputMode="decimal" autoComplete="off" maxLength={12} value={monto} onChange={(e) => setMonto(e.target.value)} />
            <CampoTexto etiqueta="Fecha del pago" type="date" max={hoyGT()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="meta text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardando} disabled={!pedidoId}>
              Registrar comprobante
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
