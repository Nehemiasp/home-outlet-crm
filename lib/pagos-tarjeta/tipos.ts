/**
 * Pasarela de pago con tarjeta. Todos los proveedores de Guatemala que se evaluaron (Recurrente, Pagadito, los bancarios como
 * VisaNet) trabajan igual: se crea un cobro, el cliente paga en una página del proveedor y el proveedor avisa con un webhook
 * firmado. Esta es esa forma común: conectar un proveedor real es escribir un archivo que cumpla `Pasarela` y agregarlo a
 * `index.ts`, sin tocar pedidos ni pagos.
 */
export type EventoPasarela = {
  /** El id del cobro en la pasarela (el que devolvió `crearCobro`). */
  externoId: string;
  estado: "pagado" | "fallido";
  /** Lo que la pasarela dice que cobró, en centavos. Se compara con lo que se pidió: si no coincide, un humano revisa. */
  monto: number;
  /** Número de autorización o de transacción, si lo da. */
  referencia?: string;
};

export interface Pasarela {
  /** «simulada», «recurrente»… Se guarda en cada cobro y se muestra como banco del pago. */
  nombre: string;
  /** Pide el cobro y devuelve la dirección donde el cliente paga. `monto` va en centavos. */
  crearCobro(p: { referencia: string; monto: number; descripcion: string }): Promise<{ externoId: string; url: string }>;
  /** Valida la firma del webhook contra el cuerpo crudo. Sin firma válida, nada se procesa. */
  verificarWebhook(cuerpo: string, cabeceras: Headers): boolean;
  /** Traduce el cuerpo del webhook a un evento, o null si no es de un cobro (otros eventos del proveedor se ignoran). */
  interpretarWebhook(cuerpo: string): EventoPasarela | null;
}
