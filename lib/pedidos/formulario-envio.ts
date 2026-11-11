import { z } from "zod";
import type { EnvioPedido } from "./gestion";

const campos = z.object({ pedidoId: z.string().min(1).max(40), guia: z.string().max(100) });

/**
 * Lee el formulario de «Marcar como enviado» (detalle del pedido y Despacho): la guía y su archivo; la paquetería ya está en el
 * pedido (se eligió en «pendiente de envío»). El archivo se pasa tal cual: lo revisa
 * `marcarEnviado` (tipo por su contenido y tamaño) antes de guardarlo.
 */
export function envioDeFormulario(datos: FormData): { pedidoId: string; envio: EnvioPedido } | null {
  const p = campos.safeParse({ pedidoId: datos.get("pedidoId"), guia: datos.get("guia") ?? "" });
  if (!p.success) return null;
  return { pedidoId: p.data.pedidoId, envio: { guia: p.data.guia, archivo: datos.get("archivo") } };
}
