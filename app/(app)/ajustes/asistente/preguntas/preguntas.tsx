"use client";

import { HelpCircle, Plus, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { Insignia } from "@/components/ui/etiquetas";
import { AreaTexto, Boton, Buscador, CampoTexto, Interruptor } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { normalizar } from "@/lib/ia/texto";
import { alternarPregunta, borrarPregunta, guardarPregunta } from "../../actions";

type Fila = { id: string; pregunta: string; respuesta: string; categoria: string; activa: boolean };

export function Preguntas({ filas }: { filas: Fila[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Fila | "nueva" | null>(null);
  const [form, setForm] = useState({ pregunta: "", respuesta: "", categoria: "general", activa: true });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Fila | null>(null);

  const visibles = filas.filter((f) => !busqueda.trim() || normalizar(`${f.pregunta} ${f.respuesta} ${f.categoria}`).includes(normalizar(busqueda.trim())));

  const abrir = (f: Fila | "nueva") => {
    setForm(f === "nueva" ? { pregunta: "", respuesta: "", categoria: "general", activa: true } : { pregunta: f.pregunta, respuesta: f.respuesta, categoria: f.categoria, activa: f.activa });
    setError("");
    setEditando(f);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarPregunta(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Pregunta guardada");
    setEditando(null);
    router.refresh();
  };
  const alternar = async (f: Fila, activa: boolean) => {
    const r = await alternarPregunta(f.id, activa);
    if (!r.ok) avisar(r.error, "error");
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const f = borrar;
    setBorrar(null);
    if (!f) return;
    const r = await borrarPregunta(f.id);
    avisar(r.ok ? "Pregunta borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-label="Preguntas frecuentes" className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cuerpo max-w-xl text-texto-suave">Es lo que el asistente consulta para responder lo que no está en el catálogo ni en los datos del negocio. Después de cambiar algo, pruébelo en la pestaña Probar.</p>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva pregunta
        </Boton>
      </div>
      <Buscador valor={busqueda} onCambio={setBusqueda} etiqueta="Buscar en las preguntas frecuentes" placeholder="Buscar pregunta, respuesta o categoría" className="max-w-md" />

      {filas.length === 0 ? (
        <EstadoVacio icono={HelpCircle} titulo="Todavía no hay preguntas frecuentes" descripcion="Agregue las que más le hacen los clientes: cambios, apartados, instalación, envíos." />
      ) : visibles.length === 0 ? (
        <EstadoVacio icono={SearchX} titulo="No hay preguntas con esa búsqueda" descripcion="Pruebe con otra palabra." />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea bg-superficie">
          {visibles.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="cuerpo-fuerte min-w-0 flex-1">{f.pregunta}</p>
                <Insignia tono="gris">{f.categoria}</Insignia>
                {!f.activa && <Insignia tono="aviso">Inactiva</Insignia>}
              </div>
              <p className="cuerpo text-texto-suave">{f.respuesta}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Interruptor etiqueta={f.activa ? "Activa" : "Inactiva"} activo={f.activa} onCambio={(v) => alternar(f, v)} />
                <span className="flex gap-2 sm:ml-auto">
                  <Boton variante="secundario" tamano="sm" onClick={() => abrir(f)} aria-label={`Editar la pregunta: ${f.pregunta}`}>
                    Editar
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(f)} aria-label={`Borrar la pregunta: ${f.pregunta}`}>
                    Borrar
                  </Boton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva pregunta frecuente" : "Editar pregunta frecuente"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Pregunta" autoComplete="off" maxLength={300} value={form.pregunta} onChange={(e) => setForm({ ...form, pregunta: e.target.value })} />
          <AreaTexto etiqueta="Respuesta" maxLength={1000} ayuda="De una a tres oraciones: así responde el asistente." value={form.respuesta} onChange={(e) => setForm({ ...form, respuesta: e.target.value })} />
          <CampoTexto etiqueta="Categoría" autoComplete="off" maxLength={30} ayuda="Por ejemplo: envíos, pagos, garantía." value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          <Interruptor etiqueta={form.activa ? "Activa: el asistente la consulta" : "Inactiva: el asistente no la usa"} activo={form.activa} onCambio={(v) => setForm({ ...form, activa: v })} />
          {error && (
            <p role="alert" className="meta text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar pregunta frecuente">
        <p className="cuerpo mb-4">
          Se borrará <strong>{borrar?.pregunta}</strong>. El asistente dejará de usarla.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar pregunta
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
