"use client";

import { Copy, Printer, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/**
 * Lo que se hace con una cotización: imprimirla (o guardarla en PDF desde el diálogo de impresión), copiar el mensaje para
 * mandarlo otra vez y, si todavía no es pedido, convertirla (abre la conversación con el panel de pedido ya cargado).
 */
export function AccionesCotizacion({ texto, convertir }: { texto: string; convertir: string | null }) {
  const router = useRouter();
  const avisar = useToast();
  const copiar = () =>
    void navigator.clipboard.writeText(texto).then(
      () => avisar("Mensaje copiado"),
      () => avisar("No se pudo copiar. Abra la conversación y escríbalo a mano.", "error"),
    );
  return (
    <div className="flex flex-wrap gap-2">
      <Boton variante="secundario" onClick={copiar}>
        <Copy className="size-4" aria-hidden />
        Copiar mensaje
      </Boton>
      <Boton variante={convertir ? "secundario" : "principal"} onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />
        Imprimir o guardar PDF
      </Boton>
      {convertir && (
        <Boton onClick={() => router.push(convertir)}>
          <ShoppingCart className="size-4" aria-hidden />
          Convertir en pedido
        </Boton>
      )}
    </div>
  );
}
