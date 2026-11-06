"use client";

import { useEffect, useState } from "react";
import { Boton, CampoTexto } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { FilaProducto, Ubicacion } from "@/lib/catalogo-tipos";
import { ajustarExistencias } from "./actions";

/** Cambiar las existencias de un producto sin entrar a editarlo. Cada cambio queda en el registro de actividad. */
export function AjusteRapido({ producto, ubicaciones, onCerrar, onGuardado }: { producto: FilaProducto | null; ubicaciones: Ubicacion[]; onCerrar: () => void; onGuardado: () => void }) {
  const avisar = useToast();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (producto) {
      setValores(Object.fromEntries(ubicaciones.map((u) => [u.id, String(producto.existencias[u.id] ?? 0)])));
      setError("");
    }
  }, [producto, ubicaciones]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!producto) return;
    const cantidades: Record<string, number> = {};
    for (const u of ubicaciones) {
      const t = (valores[u.id] ?? "").trim();
      if (!/^\d{1,6}$/.test(t)) return setError(`En "${u.nombre}" escriba un número entero, de 0 en adelante.`);
      cantidades[u.id] = Number(t);
    }
    setGuardando(true);
    const r = await ajustarExistencias(producto.id, cantidades);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Existencias actualizadas");
    onCerrar();
    onGuardado();
  };

  return (
    <Modal abierto={!!producto} onCerrar={onCerrar} titulo="Ajustar existencias">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <div>
          <p className="cuerpo-fuerte">{producto?.nombre}</p>
          <p className="meta text-texto-suave">SKU {producto?.sku}</p>
        </div>
        {ubicaciones.map((u, i) => (
          <CampoTexto
            key={u.id}
            etiqueta={u.nombre}
            inputMode="numeric"
            autoComplete="off"
            autoFocus={i === 0}
            value={valores[u.id] ?? ""}
            onChange={(e) => setValores({ ...valores, [u.id]: e.target.value })}
          />
        ))}
        {error && (
          <p role="alert" className="meta text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardando}>
            Guardar existencias
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
