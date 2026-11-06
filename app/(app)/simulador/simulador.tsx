"use client";

import { AlertCircle, Paperclip, Receipt, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Burbuja } from "@/components/ui/conversacion";
import { InsigniaCanal, nombreCanal, opcionCanal } from "@/components/ui/etiquetas";
import { Boton, CampoTexto, Selector } from "@/components/ui/form";
import { CANALES, type Channel } from "@/lib/canales/tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatTelefono } from "@/lib/utils";
import { enviarComoCliente, obtenerChat, subirComprobanteDeEjemplo, subirImagenSim, type ContactoSim } from "./actions";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });

export function Simulador({ contactosIniciales }: { contactosIniciales: ContactoSim[] }) {
  const [contactos, setContactos] = useState(contactosIniciales);
  const [canal, setCanal] = useState<Channel>("simulado");
  const [seleccion, setSeleccion] = useState("nuevo");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const nuevo = seleccion === "nuevo";
  const actual = contactos.find((c) => c.id === seleccion);
  const { datos: mensajes = [], refrescar } = useActualizacion(`${seleccion}-${canal}`, () => (nuevo ? Promise.resolve([]) : obtenerChat(seleccion, canal)), 4000);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]);

  const mandar = async (mensaje: string, imagenUrl?: string) => {
    setEnviando(true);
    setError("");
    const r = await enviarComoCliente({ contactoId: nuevo ? null : seleccion, nombre, telefono, canal, texto: mensaje, imagenUrl });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    if (nuevo) {
      setContactos((cs) => [...cs, r.contacto].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSeleccion(r.contacto.id);
      setNombre("");
      setTelefono("");
    }
    setTexto("");
    refrescar();
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    void mandar(texto);
  };
  /** Sube una imagen (o el comprobante de ejemplo) y la manda como si el cliente la hubiera enviado por el chat. */
  const mandarImagen = async (subida: Promise<{ ok: true; url: string } | { ok: false; error: string }>) => {
    setEnviando(true);
    const r = await subida;
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    await mandar("", r.url);
  };
  const alElegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const datos = new FormData();
    datos.set("archivo", f);
    void mandarImagen(subirImagenSim(datos));
  };

  return (
    <div className="p-6">
      <h1 className="titulo-pagina">Simulador</h1>
      <p className="cuerpo mt-1 mb-6 max-w-2xl text-texto-suave">
        Escriba como si fuera un cliente. El mensaje entra por el mismo camino que uno real y aparece en la bandeja. Solo existe fuera de producción.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form id="sim" onSubmit={enviar} className="flex h-fit flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
          <Selector etiqueta="Canal por el que llega" value={canal} onCambio={(v) => setCanal(v as Channel)} opciones={CANALES.map(opcionCanal)} />
          <Selector
            etiqueta="Contacto"
            value={seleccion}
            onCambio={setSeleccion}
            opciones={[{ valor: "nuevo", texto: "Contacto nuevo" }, ...contactos.map((c) => ({ valor: c.id, texto: c.telefono ? `${c.nombre} (${formatTelefono(c.telefono)})` : c.nombre }))]}
          />
          {nuevo && (
            <>
              <CampoTexto etiqueta="Nombre del contacto nuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
              <CampoTexto etiqueta="Teléfono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} ayuda="8 dígitos de Guatemala. Obligatorio en WhatsApp y Simulado." autoComplete="off" />
            </>
          )}
          <p className="meta text-texto-suave">Si el asistente está encendido, responde solo. Para contestar como asesor, abra la conversación en la bandeja; aquí verá lo que le contesten.</p>
        </form>

        {/* Teléfono del cliente */}
        <section aria-label="Teléfono del cliente" className="mx-auto flex h-[560px] w-full max-w-[360px] flex-col overflow-hidden rounded-burbuja border-8 border-carbon bg-superficie">
          <header className="flex items-center justify-between gap-2 bg-carbon px-4 py-3 text-sobre-carbon">
            <span className="cuerpo-fuerte truncate">{actual?.nombre ?? (nombre || "Contacto nuevo")}</span>
            <InsigniaCanal canal={canal} />
          </header>
          <div role="log" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto bg-fondo p-3">
            {mensajes.length === 0 && <p className="cuerpo m-auto max-w-56 text-center text-texto-suave">Todavía no hay mensajes en este canal. Escriba el primero.</p>}
            {mensajes.map((m) =>
              m.producto ? (
                // Desde el teléfono del cliente la tarjeta llega a la izquierda, como cualquier mensaje del equipo.
                <div key={m.id} className="flex justify-start [&>div]:items-start">
                  <Burbuja tipo="producto" producto={m.producto} hora={hora(m.fecha)} autor="Equipo" />
                </div>
              ) : (
                <Burbuja key={m.id} tipo={m.deCliente ? "saliente" : "entrante"} texto={m.texto} imagenUrl={m.imagenUrl} hora={hora(m.fecha)} autor={m.deCliente ? undefined : "Equipo"} />
              ),
            )}
            <div ref={fin} />
          </div>
          {error && (
            <p role="alert" className="meta flex items-start gap-1 bg-error-suave px-3 py-2 text-error">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <div className="flex gap-2 border-t border-linea p-2">
            <Boton variante="fantasma" aria-label="Adjuntar una imagen" disabled={enviando} onClick={() => archivo.current?.click()}>
              <Paperclip className="size-4" aria-hidden />
            </Boton>
            <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={alElegirArchivo} aria-label="Elegir imagen" tabIndex={-1} />
            <input
              form="sim"
              aria-label="Mensaje del cliente"
              placeholder="Escriba un mensaje"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1000}
              className="cuerpo h-10 min-w-0 flex-1 rounded-campo border border-texto-suave px-3 hover:border-texto"
            />
            <Boton form="sim" type="submit" cargando={enviando} disabled={!texto.trim()} aria-label="Enviar mensaje">
              <Send className="size-4" aria-hidden />
            </Boton>
          </div>
          <div className="border-t border-linea p-2">
            <Boton variante="secundario" tamano="sm" disabled={enviando || nuevo} onClick={() => void mandarImagen(subirComprobanteDeEjemplo())}>
              <Receipt className="size-4" aria-hidden />
              Enviar comprobante de ejemplo
            </Boton>
          </div>
        </section>
      </div>
    </div>
  );
}
