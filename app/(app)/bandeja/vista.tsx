"use client";

import { ArrowLeft, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Burbuja, Compositor, SeparadorDia } from "@/components/ui/conversacion";
import { AvatarConCanal, nombreCanal } from "@/components/ui/etiquetas";
import { Boton, ControlSegmentado } from "@/components/ui/form";
import { MenuDesplegable, Modal, type OpcionMenu } from "@/components/ui/estructura";
import { ModalDevolver } from "@/components/ui/equipo";
import { ModalPlantillas } from "@/components/ui/plantillas";
import type { PlantillaCanal } from "@/lib/canales/tipos";
import { useToast } from "@/components/ui/toast";
import type { ConversacionDTO, ItemLinea, ProductoDTO } from "@/lib/bandeja-tipos";
import { formatTelefono } from "@/lib/utils";
import { AVISO_MS, msRestantes, textoRestante } from "@/lib/canales/ventana";
import { puedeAsignar, puedeCerrar } from "@/lib/permisos";
import { useActualizacion } from "@/lib/tiempo-real";
import { alternarAsistente, asignar, cambiarEstado, devolverCola, enviarImagen, enviarPlantilla, enviarProducto, enviarTexto, guardarNota, obtener, plantillas as plantillasDelCanal, reintentar, sugerir } from "./actions";
import { Ficha } from "./ficha";
import { ComprobanteModal } from "./comprobante";
import { PanelPedido } from "./panel-pedido";
import { claveDia, etiquetaDia, horaCorta } from "./formato";
import { SelectorProducto } from "./selector-producto";

const NOMBRE_ESTADO = { abierta: "Abierta", pendiente: "Pendiente", cerrada: "Cerrada" } as const;
const TIPOS_SIN_VISTA: Record<string, string> = { audio: "Audio", video: "Video", document: "Documento", location: "Ubicación", unsupported: "Mensaje" };

export function Vista({ inicial }: { inicial: ConversacionDTO }) {
  const avisar = useToast();
  const router = useRouter();
  const { datos, refrescar } = useActualizacion(`conv-${inicial.id}`, () => obtener(inicial.id), 4000);
  const c = datos ?? inicial;

  const [ficha, setFicha] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [productos, setProductos] = useState(false);
  const [pedido, setPedido] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const [plantillas, setPlantillas] = useState<{ abierta: boolean; lista?: PlantillaCanal[]; error?: string; enviando?: boolean }>({ abierta: false });
  const [comprobante, setComprobante] = useState<{ mensajeId: string; url: string } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const archivo = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const alFondo = useRef(true);

  // La ficha se abre sola en pantallas anchas; en el teléfono es una pantalla aparte.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) setFicha(true);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Se baja al último mensaje al abrir y cuando llega uno nuevo, salvo que la persona esté leyendo más arriba.
  const ultimo = c.linea.at(-1)?.id;
  useEffect(() => {
    const el = area.current;
    if (el && alFondo.current) el.scrollTop = el.scrollHeight;
  }, [ultimo]);

  /* ── Ventana de 24 horas ── */
  const restante = msRestantes(c.lastInboundAt ? new Date(c.lastInboundAt) : null, new Date(ahora));
  const bloqueo = !c.canalActivo
    ? `${nombreCanal(c.canal)} está pendiente de conexión. Por ahora solo puede escribir notas internas.`
    : restante === 0
      ? "Pasaron más de 24 horas desde el último mensaje del cliente. Solo puede enviar plantillas o escribir notas internas."
      : undefined;
  const aviso = !bloqueo && restante < AVISO_MS ? `La ventana para responder vence en ${textoRestante(restante)}` : undefined;

  /* ── Acciones ── */
  const resolver = async (r: { ok: boolean; error?: string; mensajeId?: string } | { ok: true }) => {
    if (!r.ok) {
      avisar((r as { error: string }).error, "error");
      if (!(r as { mensajeId?: string }).mensajeId) {
        return false; // falló antes de crear el mensaje: se conserva el texto
      }
    }
    refrescar();
    return true;
  };
  const alEnviar = async (texto: string, esNota: boolean) => resolver(esNota ? await guardarNota(c.id, texto) : await enviarTexto(c.id, texto));
  const abrirPlantillas = async () => {
    setPlantillas({ abierta: true });
    const r = await plantillasDelCanal(c.id);
    setPlantillas(r.ok ? { abierta: true, lista: r.plantillas } : { abierta: true, error: r.error });
  };
  const alElegirPlantilla = async (p: PlantillaCanal, parametros: string[]) => {
    setPlantillas((s) => ({ ...s, enviando: true }));
    const r = await enviarPlantilla(c.id, p.nombre, p.idioma, parametros);
    const sigueAbierta = !r.ok && !r.mensajeId; // si falló antes de crear el mensaje, la ventana sigue abierta para corregir
    setPlantillas((s) => (sigueAbierta ? { ...s, enviando: false } : { abierta: false }));
    await resolver(r);
  };
  const alElegirProducto = async (p: ProductoDTO) => {
    setProductos(false);
    await resolver(await enviarProducto(c.id, p.id));
  };
  const alElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const datosForm = new FormData();
    datosForm.set("archivo", f);
    await resolver(await enviarImagen(c.id, datosForm));
  };
  const conAviso = async (promesa: Promise<{ ok: boolean; error?: string }>, ok: string) => {
    const r = await promesa;
    if (r.ok) avisar(ok);
    else avisar(r.error ?? "No se pudo completar la acción.", "error");
    refrescar();
  };

  const yo = c.yo;
  const opcionesAsignar: OpcionMenu[] =
    yo.rol === "admin"
      ? [
          ...c.usuarios.map((u) => ({ texto: u.id === yo.id ? `Asignar a ${u.nombre} (yo)` : `Asignar a ${u.nombre}`, onElegir: () => conAviso(asignar(c.id, u.id), `Asignada a ${u.nombre}`) })),
          ...(c.asignadaA ? [{ texto: "Quitar asignación", onElegir: () => conAviso(asignar(c.id, null), "Asignación quitada") }] : []),
        ]
      : puedeAsignar(yo, { asignadaAId: c.asignadaA?.id ?? null }, yo.id) && c.asignadaA?.id !== yo.id
        ? [{ texto: "Asignarme esta conversación", onElegir: () => conAviso(asignar(c.id, yo.id), "Conversación asignada a usted") }]
        : [];
  const dueno = { asignadaAId: c.asignadaA?.id ?? null };
  const opcionesEstado: OpcionMenu[] = (["abierta", "pendiente", "cerrada"] as const)
    .filter((e) => e !== c.estado && (e !== "cerrada" || puedeCerrar(yo, dueno)))
    .map((e) => ({
      texto: e === "cerrada" ? "Cerrar conversación" : `Marcar como ${NOMBRE_ESTADO[e].toLowerCase()}`,
      peligro: e === "cerrada",
      onElegir: () => (e === "cerrada" ? setConfirmarCierre(true) : conAviso(cambiarEstado(c.id, e), `Conversación ${e === "abierta" ? "abierta" : "pendiente"}`)),
    }));

  // Un asesor puede devolver a la cola una conversación suya; deja de verla y se reparte a otro.
  const puedeDevolver = yo.rol === "agente" && c.asignadaA?.id === yo.id && c.estado !== "cerrada";
  const alDevolver = async (motivo: string) => {
    setDevolviendo(true);
    const r = await devolverCola(c.id, motivo);
    setDevolviendo(false);
    setDevolver(false);
    if (!r.ok) return void avisar(r.error, "error");
    avisar(r.asignadaA ? `Devuelta a la cola. Ahora la atiende ${r.asignadaA}.` : "Devuelta a la cola. Queda en «Sin asignar» hasta que haya un asesor disponible.");
    router.push("/bandeja");
  };

  /* ── Mensajes ── */
  const burbuja = (m: ItemLinea) => {
    if (m.clase === "sistema") return <Burbuja key={m.id} tipo="sistema" tono={m.tono} texto={m.texto} />;
    if (m.clase === "nota") return <Burbuja key={m.id} tipo="nota" texto={m.texto} autor={m.autor} hora={horaCorta(m.fecha)} />;
    const delAsistente = m.quien === "asistente";
    const base = { hora: horaCorta(m.fecha), estado: m.estado ?? undefined, autor: delAsistente ? undefined : (m.autor ?? undefined), asistente: delAsistente, consultas: delAsistente ? m.consultado : undefined, pedido: m.pedido };
    if (m.producto) return <Burbuja key={m.id} {...base} tipo="producto" producto={m.producto} onReintentar={() => alReintentar(m.id)} />;
    const texto = m.texto ?? (m.tipo !== "text" && m.tipo !== "image" ? `${TIPOS_SIN_VISTA[m.tipo] ?? "Archivo"}: todavía no se puede mostrar aquí.` : undefined);
    const esComprobante = m.entrante && m.tipo === "image" && !!m.archivoUrl && c.pedidosAbiertos.length > 0;
    const acciones = esComprobante ? (
      <Boton variante="secundario" tamano="sm" onClick={() => setComprobante({ mensajeId: m.id, url: m.archivoUrl! })}>
        Registrar como comprobante
      </Boton>
    ) : undefined;
    return <Burbuja key={m.id} {...base} tipo={m.entrante ? "entrante" : "saliente"} texto={texto} imagenUrl={m.tipo === "image" ? (m.archivoUrl ?? undefined) : undefined} onReintentar={() => alReintentar(m.id)} acciones={acciones} />;
  };
  const cambiarAtencion = async (v: "asistente" | "asesor") => {
    if (v === "asistente") return void conAviso(alternarAsistente(c.id, true), "Conversación devuelta al asistente");
    // «Asesor» toma la conversación: pausa al asistente y la asigna a quien la toma.
    if (c.atencion === "asistente") await alternarAsistente(c.id, false);
    if (c.asignadaA?.id !== yo.id && puedeAsignar(yo, dueno, yo.id)) return void conAviso(asignar(c.id, yo.id), "Conversación asignada a usted");
    avisar("Asistente desactivado en esta conversación");
    refrescar();
  };
  const alSugerir = async () => {
    const r = await sugerir(c.id);
    if (!r.ok) {
      avisar(r.error, "error");
      return null;
    }
    return r.texto;
  };
  const alReintentar = async (id: string) => {
    const r = await reintentar(id);
    if (!r.ok) avisar(r.error, "error");
    refrescar();
  };

  let diaActual = "";
  return (
    <>
      <section aria-label="Conversación" className={`flex min-w-0 flex-1 flex-col bg-fondo ${ficha ? "max-lg:hidden" : ""}`}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linea bg-superficie p-3">
          <Link href="/bandeja" aria-label="Volver a la lista" className="grid size-10 place-items-center rounded-campo hover:bg-fondo lg:hidden">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <AvatarConCanal nombre={c.contacto.nombre} canal={c.canal} />
          <div className="min-w-44 flex-1">
            <h2 className="cuerpo-fuerte truncate">{c.contacto.nombre}</h2>
            <p className="meta truncate text-texto-suave">
              {c.contacto.telefono ? `${formatTelefono(c.contacto.telefono)} · ` : ""}
              {c.asignadaA ? `Asignada a ${c.asignadaA.id === yo.id ? "usted" : c.asignadaA.nombre}` : "Sin asignar"}
              {c.atencion === "esperando" ? " · Esperando asesor" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            <ControlSegmentado
              etiqueta="Quién atiende"
              valor={c.atencion === "asistente" ? "asistente" : c.atencion === "asesor" ? "asesor" : null}
              onCambio={cambiarAtencion}
              disabled={c.estado === "cerrada"}
              opciones={[
                { valor: "asistente", texto: "Asistente" },
                { valor: "asesor", texto: "Asesor" },
              ]}
            />
            <Boton onClick={() => setPedido(true)}>
              <ShoppingCart className="size-4" aria-hidden />
              Crear pedido
            </Boton>
            <MenuDesplegable
              etiqueta="Más"
              variante="secundario"
              opciones={[...opcionesAsignar, ...opcionesEstado, ...(puedeDevolver ? [{ texto: "Devolver a la cola", onElegir: () => setDevolver(true) }] : []), { texto: ficha ? "Ocultar ficha" : "Ver ficha", onElegir: () => setFicha(!ficha) }]}
            />
          </div>
        </header>

        <div
          ref={area}
          role="log"
          aria-label="Mensajes"
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget;
            alFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="relative flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        >
          {c.linea.map((m) => {
            const dia = claveDia(m.fecha);
            const separador = dia !== diaActual;
            diaActual = dia;
            return (
              <Fragment key={m.id}>
                {separador && <SeparadorDia texto={etiquetaDia(m.fecha)} />}
                {burbuja(m)}
              </Fragment>
            );
          })}
        </div>

        <Compositor
          key={c.id}
          respuestasRapidas={c.respuestasRapidas}
          onEnviar={alEnviar}
          onEnviarProducto={() => setProductos(true)}
          onAdjuntar={() => archivo.current?.click()}
          onSugerir={alSugerir}
          onEnviarPlantilla={c.canalActivo ? () => void abrirPlantillas() : undefined}
          aviso={aviso}
          bloqueadoMotivo={bloqueo}
          soloNotas
        />
        <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={alElegirArchivo} aria-label="Elegir imagen" tabIndex={-1} />
      </section>

      {ficha && <Ficha c={c} onCambio={refrescar} onCerrar={() => setFicha(false)} />}

      <ModalDevolver abierto={devolver} ocupado={devolviendo} onCerrar={() => setDevolver(false)} onDevolver={(m) => void alDevolver(m)} />
      <PanelPedido abierto={pedido} onCerrar={() => setPedido(false)} conversacionId={c.id} puedeEnviar={!bloqueo} onCambio={refrescar} />
      <ComprobanteModal imagen={comprobante} onCerrar={() => setComprobante(null)} c={c} onRegistrado={refrescar} />
      <ModalPlantillas abierto={plantillas.abierta} onCerrar={() => setPlantillas({ abierta: false })} plantillas={plantillas.lista} error={plantillas.error} enviando={plantillas.enviando} onEnviar={(p, v) => void alElegirPlantilla(p, v)} />
      <SelectorProducto abierto={productos} onCerrar={() => setProductos(false)} onElegir={alElegirProducto} />
      <Modal abierto={confirmarCierre} onCerrar={() => setConfirmarCierre(false)} titulo="Cerrar conversación">
        <p className="cuerpo mb-4">La conversación pasará a cerradas. Si el cliente vuelve a escribir, se abrirá de nuevo.</p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setConfirmarCierre(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              setConfirmarCierre(false);
              void conAviso(cambiarEstado(c.id, "cerrada"), "Conversación cerrada");
            }}
          >
            Cerrar conversación
          </Boton>
        </div>
      </Modal>
    </>
  );
}
