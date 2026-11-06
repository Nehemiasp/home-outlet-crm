"use client";

import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton, AreaTexto, Casilla, CampoTexto } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { Zona } from "@/lib/pedidos/envio";
import { formatQ } from "@/lib/utils";
import { borrarZonaEnvio, guardarZonaEnvio } from "../actions";

const NUEVA = { nombre: "", municipios: "", costo: "", tiempo: "", activa: true };
const aForm = (z: Zona) => ({ nombre: z.nombre, municipios: z.municipios.join(", "), costo: (z.costo / 100).toFixed(2), tiempo: z.tiempo, activa: z.activa });

export function Zonas({ filas, recoger }: { filas: Zona[]; recoger: { direccion: string | null; horario: string | null } }) {
  const router = useRouter();
  const avisar = useToast();
  const [editando, setEditando] = useState<Zona | "nueva" | null>(null);
  const [form, setForm] = useState(NUEVA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Zona | null>(null);

  const abrir = (z: Zona | "nueva") => {
    setForm(z === "nueva" ? NUEVA : aForm(z));
    setError("");
    setEditando(z);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarZonaEnvio(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Zona guardada");
    setEditando(null);
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const z = borrar;
    setBorrar(null);
    if (!z) return;
    const r = await borrarZonaEnvio(z.id);
    avisar(r.ok ? "Zona borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-labelledby="t-envios" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="t-envios" className="titulo-panel">Envíos</h2>
          <p className="cuerpo max-w-xl text-texto-suave">
            El costo se calcula solo según el municipio del cliente. Una zona sin municipios sirve para «el resto del país».
          </p>
        </div>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva zona
        </Boton>
      </div>

      <div className="rounded-campo border border-linea bg-fondo p-3">
        <p className="cuerpo-fuerte">Recoger en tienda</p>
        <p className="cuerpo text-texto-suave">
          {recoger.direccion || "Falta la dirección"}
          {recoger.horario ? ` · ${recoger.horario}` : ""}
        </p>
        <p className="meta text-texto-suave">
          Usa la dirección y el horario de <Link href="/ajustes/negocio" className="underline hover:text-texto">Datos del negocio</Link>.
        </p>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono={Truck} titulo="Todavía no hay zonas de envío" descripcion="Agregue las zonas con su costo para poder crear pedidos con envío." />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
          {filas.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="cuerpo-fuerte flex flex-wrap items-center gap-2">
                  {z.nombre}
                  <span className="cuerpo text-texto-suave">{formatQ(z.costo)}</span>
                  {!z.activa && <Insignia>Desactivada</Insignia>}
                </p>
                <p className="cuerpo text-texto-suave">
                  {z.municipios.length ? z.municipios.join(", ") : "Resto del país"} · {z.tiempo}
                </p>
              </div>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => abrir(z)} aria-label={`Editar la zona ${z.nombre}`}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(z)} aria-label={`Borrar la zona ${z.nombre}`}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva zona de envío" : "Editar zona de envío"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Nombre de la zona" autoComplete="off" maxLength={60} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <AreaTexto etiqueta="Municipios" maxLength={1000} ayuda="Separados por coma. Déjelo vacío para «resto del país»." value={form.municipios} onChange={(e) => setForm({ ...form, municipios: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Costo (Q)" inputMode="decimal" autoComplete="off" maxLength={12} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
            <CampoTexto etiqueta="Tiempo estimado" autoComplete="off" maxLength={60} ayuda="Por ejemplo: 1 a 2 días." value={form.tiempo} onChange={(e) => setForm({ ...form, tiempo: e.target.value })} />
          </div>
          <Casilla etiqueta="Zona activa" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
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

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar zona de envío">
        <p className="cuerpo mb-4">
          Se borrará la zona <strong>{borrar?.nombre}</strong>. Los pedidos ya hechos conservan su costo de envío.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar zona
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
