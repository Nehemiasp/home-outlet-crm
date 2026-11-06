"use client";

import { ArrowLeft, Package, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Insignia, InsigniaPago, InsigniaEstado, LogoCanal, nombreCanal } from "@/components/ui/etiquetas";
import { Boton, Casilla, CampoTexto } from "@/components/ui/form";
import { EncabezadoPagina, LineaDePasos, MenuDesplegable, Modal } from "@/components/ui/estructura";
import { avanceDePedido } from "@/lib/pedidos/pasos";
import { AvisoCopiar } from "./aviso-copiar";
import { useToast } from "@/components/ui/toast";
import { siguientes } from "@/lib/pedidos/estados";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatQ, formatTelefono } from "@/lib/utils";
import { actualizarGuia, avanzar, cambiarFormaPago, enviarEnlaceTarjeta, obtener, rechazar, verificar, type PedidoConPermisos } from "../actions";
import { nombreMetodo } from "@/lib/pedidos/metodos";
import { EnlaceDuplicado } from "@/components/ui/pedidos";
import { SubirComprobante } from "./subir-comprobante";
import { EstadoPagoPill, Verificacion } from "./verificacion";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-GT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" });
const soloFecha = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guatemala" });

export function Detalle({ inicial }: { inicial: PedidoConPermisos }) {
  const avisar = useToast();
  const { datos, refrescar } = useActualizacion(`pedido-${inicial.pedido.id}`, () => obtener(inicial.pedido.id), 6000);
  const { pedido: p, puedeVerificar, puedeCancelar, sinLimites, metodos, bancos, tarjeta, formasPago } = datos ?? inicial;

  const [verPago, setVerPago] = useState<string | null>(null);
  const [subir, setSubir] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [reactivar, setReactivar] = useState(false);
  const [sobrePedido, setSobrePedido] = useState(false);
  const [guia, setGuia] = useState(p.guia ?? "");
  const [copiar, setCopiar] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => setGuia(p.guia ?? ""), [p.guia]);

  /** Si el aviso al cliente no pudo salir por el canal, se muestra el texto para mandarlo a mano. */
  const tras = (aviso?: ResultadoAviso) => {
    if (aviso?.estado === "copiar" && aviso.texto) setCopiar(aviso.texto);
    else if (aviso?.estado === "fallo") avisar("El cambio se hizo, pero no se pudo avisar al cliente.", "error");
    refrescar();
  };

  const cambio = async (a: Parameters<typeof avanzar>[1], ok: string, g = "", sobre = false) => {
    setTrabajando(true);
    const r = await avanzar(p.id, a, g, sobre);
    setTrabajando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(ok);
    setEnviar(false);
    setCancelar(false);
    setReactivar(false);
    tras(r.aviso);
  };

  const guardarGuia = async () => {
    const r = await actualizarGuia(p.id, guia);
    avisar(r.ok ? "Guía guardada" : r.error, r.ok ? "exito" : "error");
    refrescar();
  };

  const confirmar = async (pagoId: string) => {
    const r = await verificar(pagoId);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.cubierto ? "Pago confirmado. El pedido está pagado." : `Pago confirmado. Falta ${formatQ(r.saldo)}.`);
    setVerPago(null);
    tras(r.aviso);
  };
  const rechazarPago = async (pagoId: string, motivo: string, mensaje: string) => {
    const r = await rechazar(pagoId, motivo, mensaje);
    if (!r.ok) return void avisar(r.error, "error");
    avisar("Pago rechazado");
    setVerPago(null);
    tras(r.aviso);
  };

  const enviarEnlace = async () => {
    setTrabajando(true);
    const r = await enviarEnlaceTarjeta(p.id);
    setTrabajando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.reutilizado ? "Ya había un enlace abierto por este saldo; se volvió a enviar" : "Enlace de pago enviado al cliente");
    tras(r.aviso);
  };

  const cambiarForma = async (metodo: string) => {
    setTrabajando(true);
    const r = await cambiarFormaPago(p.id, metodo);
    setTrabajando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar("Forma de pago cambiada");
    tras(r.aviso);
  };

  const sig = siguientes(p.estado, p.entrega);
  const puedeReactivar = p.estado === "vencido";
  const puedeCancelarAhora = puedeCancelar && sig.includes("cancelado");
  const primerPagoPorVerificar = p.pagos.find((x) => x.estado === "en_revision");
  // Una sola acción principal, según el estado.
  const principal: { texto: string; accion: () => void } | null =
    p.estado === "en_revision" && puedeVerificar && primerPagoPorVerificar
      ? { texto: "Verificar pago", accion: () => setVerPago(primerPagoPorVerificar.id) }
      : sig.includes("preparando")
        ? { texto: "Marcar como preparando", accion: () => void cambio("preparando", "Pedido en preparación") }
        : sig.includes("enviado")
          ? { texto: "Marcar como enviado", accion: () => setEnviar(true) }
          : sig.includes("listo_para_recoger")
            ? { texto: "Marcar como listo para recoger", accion: () => void cambio("listo_para_recoger", "Pedido listo para recoger") }
            : sig.includes("entregado")
              ? { texto: "Marcar como entregado", accion: () => void cambio("entregado", "Pedido entregado") }
              : puedeReactivar
                ? { texto: "Reactivar pedido", accion: () => setReactivar(true) }
                : null;
  const avance = avanceDePedido(p.estado, p.entrega, p.eventos.map((e) => e.a));
  const pagoSeleccionado = p.pagos.find((x) => x.id === verPago) ?? null;
  const acepta = p.estado === "pendiente_pago" || p.estado === "en_revision";
  const r = p.resumenPagos;
  const puedeEnlace = tarjeta && (p.metodoPago === null || p.metodoPago === "tarjeta") && p.estado === "pendiente_pago" && r.saldo > 0 && r.enRevision === 0;
  const otrasFormas = p.estado === "pendiente_pago" && r.enRevision === 0 ? formasPago.filter((f) => f.id !== p.metodoPago) : []; // se cobra el saldo, y sin comprobantes por revisar
  const cobroAbierto = p.cobrosTarjeta.find((c) => c.estado === "creado");
  const cobroFallido = !cobroAbierto && p.cobrosTarjeta[0]?.estado === "fallido";
  const imprimible = ["pagado", "preparando", "listo_para_recoger", "enviado", "entregado"].includes(p.estado);

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link href="/pedidos" className="cuerpo-fuerte inline-flex items-center gap-2 self-start text-texto hover:underline max-md:min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Pedidos
      </Link>

      <EncabezadoPagina
        titulo={p.codigo}
        insignias={
          <>
            <InsigniaEstado estado={p.estado} />
            {(p.pagoEstado === "parcial" || p.pagoEstado === "rechazado") && <InsigniaPago estado={p.pagoEstado} />}
            {p.sobrePedido && <Insignia estado="aviso">Sobre pedido</Insignia>}
          </>
        }
        detalle={
          <>
            <span className="inline-flex items-center gap-1">
              <LogoCanal canal={p.canal} />
              {nombreCanal(p.canal)}
            </span>
            <span>
              {fechaHora(p.creada)}
              {p.creadoPor ? ` · ${p.creadoPor.nombre}` : ""}
            </span>
            {p.estado === "pendiente_pago" && p.reservadoHasta && <span>Reservado hasta el {fechaHora(p.reservadoHasta)}</span>}
          </>
        }
      >
        {principal && (
          <Boton disabled={trabajando} onClick={principal.accion}>
            {principal.texto}
          </Boton>
        )}
        {p.conversacionId && (
          <Link href={`/bandeja/${p.conversacionId}`} className="cuerpo-fuerte inline-flex h-10 items-center rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
            Ver conversación
          </Link>
        )}
        {imprimible && (
          <Link href={`/pedidos/${p.id}/bodega`} target="_blank" className="cuerpo-fuerte inline-flex h-10 items-center gap-2 rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
            <Printer className="size-4" aria-hidden />
            Hoja de bodega
          </Link>
        )}
        {puedeCancelarAhora && (
          <>
            <span aria-hidden className="mx-1 hidden h-6 w-px bg-linea sm:block" />
            <Boton variante="peligro-contorno" onClick={() => setCancelar(true)}>
              Cancelar pedido
            </Boton>
          </>
        )}
      </EncabezadoPagina>

      {avance && (
        <div className="rounded-tarjeta border border-linea bg-superficie px-4 py-3">
          <LineaDePasos etiqueta="Avance del pedido" pasos={avance.pasos} actual={avance.actual} detenido={avance.detenido ? <InsigniaEstado estado={p.estado} /> : undefined} />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex flex-col gap-6">
          <section aria-label="Productos" className="rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel mb-3">Productos</h2>
            <div className="relative overflow-x-auto">
              <table className="cuerpo w-full border-collapse">
                <caption className="sr-only">Productos del pedido</caption>
                <thead>
                  <tr className="border-b border-linea text-left">
                    <th scope="col" className="cuerpo-fuerte py-2 pr-3">Producto</th>
                    <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right">Cantidad</th>
                    <th scope="col" className="cuerpo-fuerte px-3 py-2 text-right max-sm:hidden">Precio</th>
                    <th scope="col" className="cuerpo-fuerte py-2 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lineas.map((l) => (
                    <tr key={l.id} className="border-b border-linea last:border-b-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-campo border border-linea bg-fondo text-texto-suave">
                            {l.imagenUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={l.imagenUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <Package className="size-5" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="cuerpo-fuerte block">{l.nombre}</span>
                            <span className="meta block text-texto-suave">
                              SKU {l.sku}
                              {l.ubicacion ? ` · Sale de ${l.ubicacion}` : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.cantidad}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap max-sm:hidden">{formatQ(l.precio)}</td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">{formatQ(l.precio * l.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-3 ml-auto flex max-w-xs flex-col gap-1">
              <Fila t="Subtotal" v={formatQ(p.subtotal)} />
              {p.descuentoMonto > 0 && <Fila t={`Descuento${p.descuentoMotivo ? ` (${p.descuentoMotivo})` : ""}`} v={`-${formatQ(p.descuentoMonto)}`} />}
              {p.entrega === "envio" && <Fila t="Envío" v={p.costoEnvio === 0 ? "Gratis" : formatQ(p.costoEnvio)} />}
              <Fila t="Total" v={formatQ(p.total)} fuerte />
            </dl>
          </section>

          <section aria-label="Pagos" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="titulo-panel">Pagos</h2>
              <div className="flex flex-wrap items-center gap-2">
                {puedeEnlace && (
                  <Boton variante="secundario" tamano="sm" disabled={trabajando} onClick={enviarEnlace}>
                    {p.metodoPago === "tarjeta" ? "Reenviar enlace de pago" : "Enviar enlace de pago con tarjeta"}
                  </Boton>
                )}
                {otrasFormas.length > 0 && <MenuDesplegable etiqueta="Cambiar forma de pago" opciones={otrasFormas.map((f) => ({ texto: f.nombre, onElegir: () => void cambiarForma(f.id) }))} />}
                {acepta && p.pagos.length > 0 && (
                  <Boton variante="secundario" tamano="sm" onClick={() => setSubir(true)}>
                    Registrar comprobante
                  </Boton>
                )}
              </div>
            </div>
            {p.metodoPago && (
              <p className="cuerpo">
                Forma de pago: <strong>{nombreMetodo(p.metodoPago)}</strong>
              </p>
            )}
            <p className="cuerpo" aria-live="polite">
              Pagado <strong>{formatQ(r.verificado)}</strong> de <strong>{formatQ(r.total)}</strong>
              {r.saldo > 0 ? <> · Falta <strong>{formatQ(r.saldo)}</strong></> : null}
              {r.enRevision > 0 ? <span className="text-texto-suave"> · {formatQ(r.enRevision)} en revisión</span> : null}
            </p>
            {cobroAbierto && (
              <p className="meta text-texto-suave" aria-live="polite">
                Enlace de pago con tarjeta de {formatQ(cobroAbierto.monto)} enviado, esperando el pago del cliente.
              </p>
            )}
            {cobroFallido && (
              <p className="meta text-texto-suave" aria-live="polite">
                El último pago con tarjeta no se completó. Puede enviar otro enlace.
              </p>
            )}
            {p.pagos.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-dashed border-linea p-6 text-center">
                <p className="cuerpo text-texto-suave">Todavía no se ha registrado ningún comprobante.</p>
                {acepta && <Boton variante="secundario" onClick={() => setSubir(true)}>Registrar comprobante</Boton>}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
                {p.pagos.map((x) => (
                  <li key={x.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {x.comprobanteUrl && (
                        <button type="button" onClick={() => setVerPago(x.id)} aria-label={`Ver el comprobante de ${formatQ(x.monto)}`} className="shrink-0 cursor-zoom-in">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={x.comprobanteUrl} alt="" className="size-14 rounded-campo border border-linea bg-fondo object-cover" />
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="cuerpo-fuerte flex flex-wrap items-center gap-2">
                          {formatQ(x.monto)}
                          <EstadoPagoPill estado={x.estado} />
                        </p>
                        <p className="meta text-texto-suave">
                          {x.metodo}
                          {x.banco ? ` · ${x.banco}` : ""}
                          {x.referencia ? ` · Ref. ${x.referencia}` : ""} · {soloFecha(x.fechaPago)}
                        </p>
                        <p className="meta text-texto-suave">
                          Registró {x.registradoPor ?? "—"}
                          {x.verificadoPor ? ` · ${x.estado === "rechazado" ? "Rechazó" : "Verificó"} ${x.verificadoPor}` : ""}
                        </p>
                        {x.motivoRechazo && <p className="meta text-estado-peligro-texto">Motivo: {x.motivoRechazo}</p>}
                      </div>
                      {puedeVerificar && x.estado === "en_revision" && (
                        <Boton variante="secundario" tamano="sm" onClick={() => setVerPago(x.id)}>
                          Verificar
                        </Boton>
                      )}
                    </div>
                    {x.duplicados.length > 0 && (
                      <p role="alert" className="meta rounded-campo bg-estado-aviso-fondo p-2 text-estado-aviso-texto">
                        Posible duplicado: el mismo banco y referencia están en{" "}
                        {x.duplicados.map((d, i) => (
                          <span key={d.pagoId}>
                            {i > 0 && ", "}
                            <EnlaceDuplicado d={d} />
                          </span>
                        ))}
                        .
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-label="Cliente" className="rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel mb-2">Cliente</h2>
            <p className="cuerpo-fuerte">
              <Link href={`/contactos/${p.contacto.id}`} className="hover:underline">
                {p.contacto.nombre}
              </Link>
            </p>
            {p.contacto.telefono && <p className="cuerpo text-texto-suave">{formatTelefono(p.contacto.telefono)}</p>}
          </section>

          <section aria-label="Entrega" className="flex flex-col gap-2 rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel">Entrega</h2>
            {p.entrega === "recoger" ? (
              <p className="cuerpo">Recoger en tienda</p>
            ) : (
              <>
                <p className="cuerpo">
                  Envío a <strong>{p.municipio}</strong>
                  {p.zona ? ` · ${p.zona}` : ""}
                </p>
                {p.direccion && <p className="cuerpo whitespace-pre-wrap text-texto-suave">{p.direccion}</p>}
                {["pagado", "preparando", "enviado"].includes(p.estado) && (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void guardarGuia();
                    }}
                  >
                    <CampoTexto etiqueta="Número de guía" autoComplete="off" maxLength={60} className="flex-1" value={guia} onChange={(e) => setGuia(e.target.value)} />
                    <Boton type="submit" variante="secundario" disabled={guia.trim() === (p.guia ?? "")}>
                      Guardar guía
                    </Boton>
                  </form>
                )}
                {p.guia && !["pagado", "preparando", "enviado"].includes(p.estado) && <p className="cuerpo">Guía: {p.guia}</p>}
              </>
            )}
            {p.notas && (
              <p className="cuerpo whitespace-pre-wrap rounded-campo bg-fondo p-3">
                <span className="cuerpo-fuerte block">Notas</span>
                {p.notas}
              </p>
            )}
          </section>

          <section aria-label="Historial" className="rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel mb-3">Historial</h2>
            <ol className="flex flex-col gap-3">
              {[...p.eventos].reverse().map((e) => (
                <li key={e.id} className="border-l-2 border-linea pl-3">
                  <p className="cuerpo">
                    <InsigniaEstado estado={e.a} /> <span className="meta text-texto-suave">{e.quien}</span>
                  </p>
                  {e.nota && <p className="meta text-texto-suave">{e.nota}</p>}
                  <p className="meta text-texto-suave">{fechaHora(e.fecha)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Verificacion
        pago={pagoSeleccionado}
        pedido={p}
        puedeVerificar={puedeVerificar}
        onCerrar={() => setVerPago(null)}
        onConfirmar={confirmar}
        onRechazar={rechazarPago}
      />
      <SubirComprobante abierto={subir} onCerrar={() => setSubir(false)} pedido={p} metodos={metodos} bancos={bancos} onRegistrado={(aviso) => { setSubir(false); tras(aviso); }} />

      <Modal abierto={enviar} onCerrar={() => setEnviar(false)} titulo="Marcar como enviado">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void cambio("enviado", "Pedido enviado", guia);
          }}
        >
          <CampoTexto etiqueta="Número de guía (opcional)" autoComplete="off" maxLength={60} ayuda="Si lo escribe, se manda al cliente en el aviso." value={guia} onChange={(e) => setGuia(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setEnviar(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={trabajando}>
              Marcar como enviado
            </Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={reactivar} onCerrar={() => setReactivar(false)} titulo="Reactivar pedido">
        <p className="cuerpo mb-4">Se vuelven a apartar las existencias y empieza de nuevo el tiempo de reserva. Si ya no alcanzan, no se reactiva.</p>
        {sinLimites && <Casilla etiqueta="Apartar «sobre pedido» aunque no alcance" checked={sobrePedido} onChange={(e) => setSobrePedido(e.target.checked)} />}
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setReactivar(false)}>
            Cancelar
          </Boton>
          <Boton cargando={trabajando} onClick={() => void cambio("pendiente_pago", "Pedido reactivado", "", sobrePedido)}>
            Reactivar pedido
          </Boton>
        </div>
      </Modal>

      <Modal abierto={cancelar} onCerrar={() => setCancelar(false)} titulo="Cancelar pedido">
        <p className="cuerpo mb-4">
          Se cancelará el pedido <strong>{p.codigo}</strong>. Las unidades apartadas {r.verificado > 0 ? "y las ya descontadas vuelven a la existencia" : "vuelven a la existencia"}. Esto no se puede deshacer.
          {r.verificado > 0 ? " El pedido ya tiene pagos verificados: la devolución del dinero se hace aparte." : ""}
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setCancelar(false)}>
            No cancelar
          </Boton>
          <Boton variante="peligro" cargando={trabajando} onClick={() => void cambio("cancelado", "Pedido cancelado")}>
            Cancelar pedido
          </Boton>
        </div>
      </Modal>

      <AvisoCopiar texto={copiar} onCerrar={() => setCopiar(null)} />
    </div>
  );
}

function Fila({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? "cuerpo-fuerte border-t border-linea pt-1" : "cuerpo"}`}>
      <dt>{t}</dt>
      <dd>{v}</dd>
    </div>
  );
}
