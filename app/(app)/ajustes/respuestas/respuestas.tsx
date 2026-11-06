"use client";

import { MessageSquareText, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { AreaTexto, Boton, CampoTexto } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { borrarRespuesta, guardarRespuesta } from "../actions";

type Fila = { id: string; atajo: string; texto: string };

export function Respuestas({ filas }: { filas: Fila[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [editando, setEditando] = useState<Fila | "nueva" | null>(null);
  const [form, setForm] = useState({ atajo: "/", texto: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Fila | null>(null);

  const abrir = (f: Fila | "nueva") => {
    setForm(f === "nueva" ? { atajo: "/", texto: "" } : { atajo: f.atajo, texto: f.texto });
    setError("");
    setEditando(f);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarRespuesta(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Respuesta guardada");
    setEditando(null);
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const f = borrar;
    setBorrar(null);
    if (!f) return;
    const r = await borrarRespuesta(f.id);
    avisar(r.ok ? "Respuesta borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-label="Respuestas rápidas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cuerpo max-w-xl text-texto-suave">
          Textos que el equipo inserta en la conversación escribiendo <strong>/</strong> y el atajo. Puede usar <code className="cuerpo-fuerte">{"{negocio}"}</code>, <code className="cuerpo-fuerte">{"{horario}"}</code>, <code className="cuerpo-fuerte">{"{direccion}"}</code>, <code className="cuerpo-fuerte">{"{pagos}"}</code> y <code className="cuerpo-fuerte">{"{cuentas}"}</code>: se rellenan con los Datos del negocio y las cuentas de Pagos y envíos.
        </p>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva respuesta
        </Boton>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono={MessageSquareText} titulo="Todavía no hay respuestas rápidas" descripcion="Cree la primera para responder más rápido a las preguntas de siempre." />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea bg-superficie">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="cuerpo-fuerte">{f.atajo}</p>
                <p className="cuerpo whitespace-pre-wrap text-texto-suave">{f.texto}</p>
              </div>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => abrir(f)} aria-label={`Editar ${f.atajo}`}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(f)} aria-label={`Borrar ${f.atajo}`}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva respuesta rápida" : "Editar respuesta rápida"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Atajo" autoComplete="off" maxLength={30} ayuda="Empieza con /, por ejemplo /horario." value={form.atajo} onChange={(e) => setForm({ ...form, atajo: e.target.value })} />
          <AreaTexto etiqueta="Texto" maxLength={1000} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
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

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar respuesta rápida">
        <p className="cuerpo mb-4">
          Se borrará <strong>{borrar?.atajo}</strong>. Los mensajes que ya se enviaron con ella no cambian.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar respuesta
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
