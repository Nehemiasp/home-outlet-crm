"use client";

import { Landmark, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton, Casilla, CampoTexto, Selector } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { borrarCuentaBancaria, guardarCuentaBancaria } from "../actions";

type Fila = { id: string; banco: string; tipo: "monetaria" | "ahorro"; numero: string; titular: string; activa: boolean };
const NUEVA = { banco: "", tipo: "monetaria" as Fila["tipo"], numero: "", titular: "", activa: true };

export function Cuentas({ filas }: { filas: Fila[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [editando, setEditando] = useState<Fila | "nueva" | null>(null);
  const [form, setForm] = useState(NUEVA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Fila | null>(null);

  const abrir = (f: Fila | "nueva") => {
    setForm(f === "nueva" ? NUEVA : { banco: f.banco, tipo: f.tipo, numero: f.numero, titular: f.titular, activa: f.activa });
    setError("");
    setEditando(f);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarCuentaBancaria(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Cuenta guardada");
    setEditando(null);
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const f = borrar;
    setBorrar(null);
    if (!f) return;
    const r = await borrarCuentaBancaria(f.id);
    avisar(r.ok ? "Cuenta borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-labelledby="t-cuentas" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="t-cuentas" className="titulo-panel">Cuentas bancarias</h2>
          <p className="cuerpo max-w-xl text-texto-suave">
            Las cuentas activas se envían al cliente con el resumen del pedido y se pueden insertar en una respuesta rápida con <code className="cuerpo-fuerte">{"{cuentas}"}</code>.
          </p>
        </div>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva cuenta
        </Boton>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono={Landmark} titulo="Todavía no hay cuentas" descripcion="Agregue la primera para poder cobrar por transferencia o depósito." />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="cuerpo-fuerte flex flex-wrap items-center gap-2">
                  {f.banco}
                  {!f.activa && <Insignia>Desactivada</Insignia>}
                </p>
                <p className="cuerpo text-texto-suave">
                  {f.tipo === "ahorro" ? "Ahorro" : "Monetaria"} {f.numero} · {f.titular}
                </p>
              </div>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => abrir(f)} aria-label={`Editar la cuenta de ${f.banco} ${f.numero}`}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(f)} aria-label={`Borrar la cuenta de ${f.banco} ${f.numero}`}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva cuenta bancaria" : "Editar cuenta bancaria"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Banco" autoComplete="off" maxLength={60} value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
          <Selector
            etiqueta="Tipo de cuenta"
            opciones={[
              { valor: "monetaria", texto: "Monetaria" },
              { valor: "ahorro", texto: "Ahorro" },
            ]}
            value={form.tipo}
            onCambio={(v) => setForm({ ...form, tipo: v as Fila["tipo"] })}
          />
          <CampoTexto etiqueta="Número de cuenta" autoComplete="off" maxLength={40} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          <CampoTexto etiqueta="Titular" autoComplete="off" maxLength={80} value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
          <Casilla etiqueta="Cuenta activa (se envía a los clientes)" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
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

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar cuenta bancaria">
        <p className="cuerpo mb-4">
          Se borrará la cuenta de <strong>{borrar?.banco}</strong> {borrar?.numero}. Los pagos ya registrados no cambian.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar cuenta
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
