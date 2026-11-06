"use client";

import { useEffect, useState } from "react";
import { Boton, CampoTexto, Selector } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import type { DetallePedido } from "@/lib/pedidos/consultas";
import { subirComprobante } from "../actions";

const hoyGT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });

/** Registrar un comprobante desde el detalle del pedido, subiendo la imagen (por ejemplo, si el cliente la mandó por otro medio). */
export function SubirComprobante({ abierto, onCerrar, pedido, metodos, bancos, onRegistrado }: { abierto: boolean; onCerrar: () => void; pedido: DetallePedido; metodos: { id: string; nombre: string }[]; bancos: string[]; onRegistrado: (aviso: ResultadoAviso) => void }) {
  const avisar = useToast();
  const [tipo, setTipo] = useState("transferencia");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyGT());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setTipo(metodos.find((m) => m.id === pedido.metodoPago)?.id ?? metodos[0]?.id ?? "transferencia"); // la forma que pidió el cliente
    setBanco("");
    setReferencia("");
    setMonto(pedido.resumenPagos.saldo > 0 ? (pedido.resumenPagos.saldo / 100).toFixed(2) : "");
    setFecha(hoyGT());
    setArchivo(null);
    setError("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return setError("Elija la imagen del comprobante.");
    setGuardando(true);
    setError("");
    const datos = new FormData();
    for (const [k, v] of Object.entries({ pedidoId: pedido.id, tipo, banco, referencia, monto, fecha })) datos.set(k, v);
    datos.set("archivo", archivo);
    const r = await subirComprobante(datos);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar(r.duplicados.length ? "Comprobante registrado. Hay un posible duplicado: revise el pago." : "Comprobante registrado. El pedido pasó a revisión de pago.");
    onRegistrado(r.aviso);
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Subir comprobante">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="cuerpo-fuerte">Imagen del comprobante</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="cuerpo" />
          <span className="meta text-texto-suave">JPG, PNG o WebP de hasta 5 MB.</span>
        </label>
        <Selector etiqueta="Método" opciones={metodos.map((m) => ({ valor: m.id, texto: m.nombre }))} value={tipo} onCambio={setTipo} />
        <CampoTexto etiqueta="Banco" autoComplete="off" maxLength={60} list="bancos-subir" value={banco} onChange={(e) => setBanco(e.target.value)} />
        <datalist id="bancos-subir">
          {bancos.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <CampoTexto etiqueta="Referencia o número de boleta" autoComplete="off" maxLength={60} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Monto (Q)" inputMode="decimal" autoComplete="off" maxLength={12} value={monto} onChange={(e) => setMonto(e.target.value)} />
          <CampoTexto etiqueta="Fecha del pago" type="date" max={hoyGT()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
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
            Registrar comprobante
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
