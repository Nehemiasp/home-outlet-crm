"use client";

import { Plus, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { InsigniaEtiqueta, type Tono } from "@/components/ui/etiquetas";
import { Boton, CampoTexto, Selector } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { borrarEtiqueta, guardarEtiqueta } from "../actions";

type Fila = { id: string; nombre: string; color: string; contactos: number };

// Los 6 tonos del sistema de diseño, con su nombre en español.
const COLORES: [Tono, string][] = [["carbon", "Carbón"], ["naranja", "Naranja"], ["exito", "Verde"], ["aviso", "Ámbar"], ["error", "Rojo"], ["gris", "Gris"]];

export function Etiquetas({ filas }: { filas: Fila[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [editando, setEditando] = useState<Fila | "nueva" | null>(null);
  const [form, setForm] = useState({ nombre: "", color: "gris" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Fila | null>(null);

  const abrir = (f: Fila | "nueva") => {
    setForm(f === "nueva" ? { nombre: "", color: "gris" } : { nombre: f.nombre, color: f.color });
    setError("");
    setEditando(f);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarEtiqueta(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Etiqueta guardada");
    setEditando(null);
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const f = borrar;
    setBorrar(null);
    if (!f) return;
    const r = await borrarEtiqueta(f.id);
    avisar(r.ok ? "Etiqueta borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-label="Etiquetas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cuerpo max-w-xl text-texto-suave">Marcas para clasificar a los clientes. Se ponen y se quitan desde la ficha de cada contacto.</p>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva etiqueta
        </Boton>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono={Tag} titulo="Todavía no hay etiquetas" descripcion="Cree la primera, por ejemplo Mayorista o Cliente frecuente." />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea bg-superficie">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4">
              <InsigniaEtiqueta nombre={f.nombre} tono={f.color as Tono} />
              <span className="meta flex-1 text-texto-suave">
                {f.contactos} {f.contactos === 1 ? "contacto" : "contactos"}
              </span>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => abrir(f)} aria-label={`Editar la etiqueta ${f.nombre}`}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(f)} aria-label={`Borrar la etiqueta ${f.nombre}`}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva etiqueta" : "Editar etiqueta"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Nombre" autoComplete="off" maxLength={30} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <Selector etiqueta="Color" value={form.color} onCambio={(v) => setForm({ ...form, color: v })} opciones={COLORES.map(([valor, texto]) => ({ valor, texto }))} />
          <p className="cuerpo flex items-center gap-2">
            Así se verá: <InsigniaEtiqueta nombre={form.nombre.trim() || "Etiqueta"} tono={form.color as Tono} />
          </p>
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

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar etiqueta">
        <p className="cuerpo mb-4">
          Se borrará <strong>{borrar?.nombre}</strong>
          {borrar && borrar.contactos > 0 ? ` y se quitará de ${borrar.contactos} ${borrar.contactos === 1 ? "contacto" : "contactos"}` : ""}. Los contactos no se borran.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar etiqueta
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
