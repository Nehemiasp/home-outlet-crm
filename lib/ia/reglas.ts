import { normalizar } from "./texto";

/** Lo que el código sabe del cliente antes de llamar al modelo. */
export type ContextoReglas = { pedidoPendiente?: boolean };

const DICE_QUE_PAGO = /\b(ya pague|ya deposite|ya transferi|ya hice (el|la|mi) (pago|deposito|transferencia)|hice (el|la|mi) (pago|deposito|transferencia)|acabo de (pagar|depositar|transferir)|i (already|just) (paid|deposited|transferred)|i made (the|my) (payment|deposit|transfer))\b/;

/**
 * Reglas que se cumplen en el código antes de llamar al modelo, para no depender de que el modelo las recuerde:
 * una imagen, audio o video, o pedir hablar con una persona, o decir que ya pagó, pasan siempre a un asesor.
 * Si el cliente tiene un pedido esperando pago, una imagen es un posible comprobante: así lo ve el asesor.
 */
export function derivacionPrevia(texto: string | null | undefined, tipo: string, ctx: ContextoReglas = {}): string | null {
  if (tipo === "image" && ctx.pedidoPendiente) return "posible comprobante de pago";
  if (tipo !== "text" || !texto?.trim()) return "el cliente envió una imagen, audio o video";
  const t = normalizar(texto);
  if (/\b(asesor|asesora|persona|humano|agente)\b/.test(t)) return "pidió hablar con una persona";
  if (DICE_QUE_PAGO.test(t)) return ctx.pedidoPendiente ? "dice que ya pagó (posible comprobante)" : "dice que ya pagó";
  return null;
}

/**
 * ¿La respuesta afirma que un pago ya está confirmado o recibido? Solo cuenta lo afirmativo:
 * «todavía no confirmamos su pago» o «su comprobante está en revisión» no lo son.
 */
export function afirmaPagoConfirmado(texto: string): boolean {
  return (normalizar(texto).match(/[^.!?\n]+/g) ?? []).some((oracion) => {
    const t = ` ${oracion} `;
    const habla = /\b(pago|pagos|deposito|transferencia|comprobante|abono|payment|deposit|transfer)\b/.test(t);
    const confirma = /\b(confirm\w*|acredit\w*|verific\w*|aprobad\w*|recibimos|recibido|recibida|received|confirmed|approved)\b/.test(t) || /\bya (esta|fue|quedo) (pagad\w*|cancelad\w*)\b/.test(t);
    const niega = /\b(no|aun no|todavia no|ni|sin|nunca|hasta que|en cuanto|cuando|una vez|se confirme|confirmemos|confirmar\w*|confirmare\w*|pendiente|revis\w*|verificar\w*|verificand\w*|not|yet|until|once|review)\b/.test(t);
    return habla && confirma && !niega;
  });
}

export const TEXTO_PAGO_NO_CONFIRMADO = "Su pago todavía no aparece como confirmado. Un asesor lo revisará y le avisará.";

/**
 * Regla de salida: el asistente solo puede decir que un pago está confirmado si el cliente tiene un pedido con pago verificado.
 * Si no, se cambia el texto y la conversación pasa a un asesor.
 */
export function revisarSalida(texto: string, hayPagoConfirmado: boolean): { texto: string; derivar?: string } {
  if (hayPagoConfirmado || !afirmaPagoConfirmado(texto)) return { texto };
  return { texto: TEXTO_PAGO_NO_CONFIRMADO, derivar: "el asistente iba a afirmar un pago sin confirmación" };
}
