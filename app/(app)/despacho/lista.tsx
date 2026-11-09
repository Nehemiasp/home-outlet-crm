"use client";

import { Printer, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FotoProducto } from "@/app/(app)/catalogo/existencias";
import { EstadoVacio } from "@/components/ui/estados";
import { InsigniaEstado } from "@/components/ui/etiquetas";
import { AvisoGuiaManual, EnlaceGuia, ModalEnviado, type DatosEnvioForm } from "@/components/ui/envio";
import { Boton } from "@/components/ui/form";
import { EncabezadoPagina, Modal, PestanasConContador } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { EstadoPedido } from "@/generated/prisma/client";
import type { FilaDespacho } from "@/lib/pedidos/despacho";
import { formatTelefono } from "@/lib/utils";
import { useActualizacion } from "@/lib/tiempo-real";
import { darPaso, enviarDesdeDespacho, listarParaDespacho } from "./actions";

const PESTANAS = [
  { id: "por-preparar", texto: "Por preparar", estados: ["pagado"] },
  { id: "preparando", texto: "Preparando", estados: ["preparando"] },
  { id: "por-entregar", texto: "Listos y enviados", estados: ["listo_para_recoger", "enviado"] },
] as const;

const TEXTO_PASO: Partial<Record<EstadoPedido, string>> = {
  preparando: "Empezar a preparar",
  listo_para_recoger: "Listo para recoger",
  enviado: "Marcar como enviado",
  entregado: "Marcar como entregado",
};
/** «Listo para recoger» le avisa al cliente por el chat: se confirma antes. «Enviado» tiene su propia ventana (cómo sale y la guía). */
const AVISAN: readonly EstadoPedido[] = ["listo_para_recoger"];

export function ListaDespacho({ paqueterias }: { paqueterias: string[] }) {
  const avisar = useToast();
  const { datos, fallo, refrescar } = useActualizacion("despacho", listarParaDespacho, 15_000);
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]["id"]>("por-preparar");
  const [confirmar, setConfirmar] = useState<{ pedido: FilaDespacho; a: EstadoPedido } | null>(null);
  const [enviando, setEnviando] = useState<FilaDespacho | null>(null);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [guiaManual, setGuiaManual] = useState<{ url: string; nombre: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const filas = datos ?? [];
  const de = (id: (typeof PESTANAS)[number]["id"]) => filas.filter((f) => (PESTANAS.find((p) => p.id === id)!.estados as readonly EstadoPedido[]).includes(f.estado));
  const visibles = de(pestana);

  const ejecutar = async (p: FilaDespacho, a: EstadoPedido) => {
    setTrabajando(true);
    const r = await darPaso(p.id, a);
    setTrabajando(false);
    setConfirmar(null);
    if (!r.ok) avisar(r.error, "error");
    else if (r.aviso && (r.aviso.estado === "copiar" || r.aviso.estado === "fallo")) avisar(`Pedido ${p.codigo} actualizado, pero no se pudo avisar al cliente por el chat. Avise a su jefe.`, "error");
    else avisar(`Pedido ${p.codigo} actualizado`);
    refrescar();
  };
  const pedirPaso = (p: FilaDespacho, a: EstadoPedido) => {
    if (a === "enviado") {
      setErrorEnvio("");
      setEnviando(p);
    } else if (AVISAN.includes(a)) setConfirmar({ pedido: p, a });
    else void ejecutar(p, a);
  };

  /** «Marcar como enviado»: va como formulario porque lleva el archivo de la guía. */
  const enviar = async (p: FilaDespacho, d: DatosEnvioForm) => {
    setTrabajando(true);
    setErrorEnvio("");
    const datos = new FormData();
    datos.set("pedidoId", p.id);
    datos.set("paqueteria", d.paqueteria);
    datos.set("guia", d.guia);
    if (d.archivo) datos.set("archivo", d.archivo);
    const r = await enviarDesdeDespacho(datos);
    setTrabajando(false);
    if (!r.ok) return setErrorEnvio(r.error);
    setEnviando(null);
    if (r.aviso && (r.aviso.estado === "copiar" || r.aviso.estado === "fallo")) avisar(`Pedido ${p.codigo} enviado, pero no se pudo avisar al cliente por el chat. Avise a su jefe.`, "error");
    else avisar(`Pedido ${p.codigo} enviado`);
    if (r.guia?.estado === "manual") setGuiaManual(r.guia);
    refrescar();
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <EncabezadoPagina titulo="Despacho" detalle="Pedidos ya pagados que hay que empacar y entregar, del más antiguo al más nuevo. Sin precios ni pagos." />
      <PestanasConContador
        etiqueta="Estado del despacho"
        activa={pestana}
        onCambio={(id) => setPestana(id as typeof pestana)}
        pestanas={PESTANAS.map((p) => ({ id: p.id, texto: p.texto, contador: datos ? de(p.id).length : undefined, urgente: p.id === "por-preparar" }))}
      />

      {fallo && !datos && <p role="alert" className="meta text-error">No se pudo cargar. Se reintenta solo.</p>}
      {datos && visibles.length === 0 ? (
        <EstadoVacio icono={Truck} titulo="No hay pedidos aquí" descripcion={pestana === "por-preparar" ? "Cuando se confirme el pago de un pedido aparecerá en esta lista." : "Nada por ahora."} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visibles.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="cuerpo-fuerte">
                    {p.codigo} · {p.cliente}
                  </p>
                  <p className="meta text-texto-suave">
                    {p.entrega === "envio" ? `Envío a ${p.lugar}` : `Recoger en ${p.tienda ?? "tienda"}`}
                    {p.telefono ? ` · ${formatTelefono(p.telefono)}` : ""}
                  </p>
                </div>
                <InsigniaEstado estado={p.estado} />
              </div>
              {p.entrega === "envio" && p.direccion && <p className="cuerpo whitespace-pre-wrap">{p.direccion}</p>}
              {p.guia && (
                <p className="meta text-texto-suave">
                  {p.paqueteria ? `${p.paqueteria} · ` : ""}Guía: {p.guia}
                </p>
              )}
              {p.guiaArchivo && <EnlaceGuia guia={p.guiaArchivo} />}

              <ul className="flex flex-col divide-y divide-linea rounded-campo border border-linea">
                {p.lineas.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 p-2">
                    <FotoProducto url={l.imagenUrl} className="size-12 shrink-0 rounded-campo" />
                    <div className="min-w-0 flex-1">
                      <p className="cuerpo-fuerte">{l.nombre}</p>
                      <p className="meta text-texto-suave">
                        SKU {l.sku}
                        {l.ubicacion ? ` · ${l.ubicacion}` : ""}
                      </p>
                    </div>
                    <span className="titulo-panel shrink-0">× {l.cantidad}</span>
                  </li>
                ))}
              </ul>
              {p.notas && (
                <p className="cuerpo rounded-campo bg-fondo p-2">
                  <span className="cuerpo-fuerte">Notas: </span>
                  {p.notas}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Link href={`/pedidos/${p.id}/bodega`} target="_blank" className="cuerpo-fuerte inline-flex h-10 items-center justify-center gap-2 rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
                  <Printer className="size-4" aria-hidden />
                  Hoja de bodega
                </Link>
                {p.pasos.map((a, i) => (
                  <Boton key={a} variante={i === 0 ? "principal" : "secundario"} disabled={trabajando} onClick={() => pedirPaso(p, a)}>
                    {TEXTO_PASO[a]}
                  </Boton>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={!!confirmar} onCerrar={() => setConfirmar(null)} titulo={confirmar ? TEXTO_PASO[confirmar.a]! : ""}>
        {confirmar && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar(confirmar.pedido, confirmar.a);
            }}
          >
            <p className="cuerpo">
              El pedido <strong>{confirmar.pedido.codigo}</strong> pasará a «listo para recoger» y <strong>se le avisará al cliente por el chat</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setConfirmar(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={trabajando}>
                Confirmar
              </Boton>
            </div>
          </form>
        )}
      </Modal>
      <ModalEnviado
        abierto={!!enviando}
        codigo={enviando?.codigo ?? ""}
        paqueterias={paqueterias}
        guiaActual={enviando ? { paqueteria: enviando.paqueteria, guia: enviando.guia } : undefined}
        archivoActual={enviando?.guiaArchivo?.nombre}
        trabajando={trabajando}
        error={errorEnvio}
        onCerrar={() => setEnviando(null)}
        onConfirmar={(d) => enviando && void enviar(enviando, d)}
      />
      <AvisoGuiaManual guia={guiaManual} onCerrar={() => setGuiaManual(null)} />
    </div>
  );
}
