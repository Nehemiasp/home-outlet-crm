"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/form";
import { resolverCobroSimulado } from "./actions";

export function Botones({ externoId }: { externoId: string }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(resultado: "pagado" | "fallido") {
    setTrabajando(true);
    setError(null);
    const r = await resolverCobroSimulado(externoId, resultado);
    setTrabajando(false);
    if (!r.ok) return setError(r.error ?? "No se pudo completar.");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <Boton disabled={trabajando} onClick={() => resolver("pagado")}>
        Pagar con la tarjeta de prueba
      </Boton>
      <Boton variante="secundario" disabled={trabajando} onClick={() => resolver("fallido")}>
        Simular un pago rechazado
      </Boton>
      {error && (
        <p role="alert" className="meta text-error">
          {error}
        </p>
      )}
    </div>
  );
}
