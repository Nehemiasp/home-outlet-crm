"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InsigniaPago } from "@/components/ui/etiquetas";
import { Boton, CampoTexto } from "@/components/ui/form";
import { Modal, PanelLateral } from "@/components/ui/estructura";
import { EnlaceDuplicado } from "@/components/ui/pedidos";
import type { DetallePedido } from "@/lib/pedidos/consultas";
import { formatQ } from "@/lib/utils";
import { previsualizarRechazo } from "../actions";

type Pago = DetallePedido["pagos"][number];

export function EstadoPagoPill({ estado }: { estado: Pago["estado"] }) {
  return <InsigniaPago estado={estado === "verificado" ? "pagado" : estado === "rechazado" ? "rechazado" : "en_revision"} />;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guatemala" });

/** Vista de verificación: el comprobante en grande junto a los datos, con «Confirmar pago» y «Rechazar». */
export function Verificacion({
  pago, pedido, puedeVerificar, onCerrar, onConfirmar, onRechazar, lateral,
}: {
  pago: Pago | null;
  pedido: DetallePedido;
  puedeVerificar: boolean;
  onCerrar: () => void;
  onConfirmar: (pagoId: string) => Promise<void>;
  onRechazar: (pagoId: string, motivo: string, mensaje: string) => Promise<void>;
  /** Se abre como panel lateral (desde la lista) en vez de ventana grande (desde el detalle). */
  lateral?: boolean;
}) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [editado, setEditado] = useState(false);
  const [avisoActivo, setAvisoActivo] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    setRechazando(false);
    setMotivo("");
    setMensaje("");
    setEditado(false);
  }, [pago?.id]);

  // El mensaje al cliente se arma con el motivo; si la persona lo edita, se respeta su texto.
  useEffect(() => {
    if (!rechazando || editado) return;
    let vigente = true;
    const t = setTimeout(() => void previsualizarRechazo(pedido.id, motivo).then((r) => vigente && (setMensaje(r.texto), setAvisoActivo(r.activo))), 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [rechazando, motivo, editado, pedido.id]);

  const decidible = !!pago && puedeVerificar && pago.estado === "en_revision";
  const confirmar = async () => {
    if (!pago) return;
    setTrabajando(true);
    await onConfirmar(pago.id);
    setTrabajando(false);
  };
  const rechazar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pago) return;
    setTrabajando(true);
    await onRechazar(pago.id, motivo, avisoActivo ? mensaje : "");
    setTrabajando(false);
  };

  const Contenedor = lateral ? PanelLateral : Modal;
  return (
    <Contenedor abierto={!!pago} onCerrar={onCerrar} titulo="Verificar pago" {...(lateral ? {} : { grande: true })}>
      {pago && (
        <div className={lateral ? "flex flex-col gap-4" : "grid gap-4 md:grid-cols-2"}>
          <div className="flex flex-col gap-2">
            {pago.comprobanteUrl ? (
              <a href={pago.comprobanteUrl} target="_blank" rel="noreferrer" aria-label="Abrir el comprobante en una pestaña nueva">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pago.comprobanteUrl} alt="Comprobante de pago" className="max-h-[60vh] w-full rounded-campo border border-linea bg-fondo object-contain" />
              </a>
            ) : (
              <p className="cuerpo rounded-campo border border-dashed border-linea p-6 text-center text-texto-suave">Este pago no tiene imagen del comprobante.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="titulo-panel">{formatQ(pago.monto)}</span>
              <EstadoPagoPill estado={pago.estado} />
            </p>
            <dl className="cuerpo grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-texto-suave">Método</dt>
              <dd>{pago.metodo}</dd>
              {pago.banco && (<><dt className="text-texto-suave">Banco</dt><dd>{pago.banco}</dd></>)}
              {pago.referencia && (<><dt className="text-texto-suave">Referencia</dt><dd className="cuerpo-fuerte">{pago.referencia}</dd></>)}
              <dt className="text-texto-suave">Fecha del pago</dt>
              <dd>{fecha(pago.fechaPago)}</dd>
              <dt className="text-texto-suave">Registró</dt>
              <dd>{pago.registradoPor ?? "—"}</dd>
              <dt className="text-texto-suave">Pedido</dt>
              <dd>
                {pedido.codigo} · {formatQ(pedido.total)}
              </dd>
              <dt className="text-texto-suave">Falta pagar</dt>
              <dd>{formatQ(pedido.resumenPagos.saldo)}</dd>
            </dl>
            {pago.monto !== pedido.resumenPagos.saldo && pago.estado === "en_revision" && (
              <p className="meta rounded-campo bg-fondo p-2 text-texto-suave">
                {pago.monto < pedido.resumenPagos.saldo ? "Es un pago parcial: el pedido seguirá esperando el resto." : "Es más de lo que falta por pagar."}
              </p>
            )}
            {pago.duplicados.length > 0 && (
              <p role="alert" className="meta rounded-campo bg-aviso-suave p-2 text-aviso">
                Posible duplicado: el mismo banco y referencia están en{" "}
                {pago.duplicados.map((d, i) => (
                  <span key={d.pagoId}>
                    {i > 0 && ", "}
                    <EnlaceDuplicado d={d} />
                  </span>
                ))}
                .
              </p>
            )}
            {pago.motivoRechazo && <p className="meta text-error">Motivo del rechazo: {pago.motivoRechazo}</p>}

            {decidible && !rechazando && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton cargando={trabajando} onClick={confirmar}>
                  Aprobar
                </Boton>
                <Boton variante="peligro-contorno" onClick={() => setRechazando(true)}>
                  Rechazar
                </Boton>
              </div>
            )}
            {decidible && rechazando && (
              <form onSubmit={rechazar} className="flex flex-col gap-3">
                <CampoTexto etiqueta="Motivo del rechazo" autoComplete="off" maxLength={200} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                {avisoActivo ? (
                  <label className="flex flex-col gap-1">
                    <span className="cuerpo-fuerte">Mensaje al cliente</span>
                    <span className="meta text-texto-suave">Puede editarlo antes de enviarlo.</span>
                    <textarea
                      value={mensaje}
                      onChange={(e) => {
                        setMensaje(e.target.value);
                        setEditado(true);
                      }}
                      rows={5}
                      maxLength={2000}
                      className="cuerpo w-full resize-none rounded-campo border border-texto-suave p-3 hover:border-texto"
                    />
                  </label>
                ) : (
                  <p className="meta text-texto-suave">El aviso de pago rechazado está apagado en Ajustes: no se le mandará mensaje al cliente.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundario" onClick={() => setRechazando(false)}>
                    Volver
                  </Boton>
                  <Boton type="submit" variante="peligro" cargando={trabajando} disabled={!motivo.trim()}>
                    Rechazar pago
                  </Boton>
                </div>
              </form>
            )}
            {!decidible && pago.estado === "en_revision" && <p className="meta text-texto-suave">Solo un administrador, un jefe de tienda o quien tenga el permiso de verificar pagos puede confirmarlo.</p>}
          </div>
        </div>
      )}
    </Contenedor>
  );
}
