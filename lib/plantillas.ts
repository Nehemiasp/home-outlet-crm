export type DatosNegocio = {
  nombre: string;
  horario: string | null;
  direccion: string | null;
  pagos?: string | null;
  envios?: string | null;
  garantia?: string | null;
  cuentas?: string | null;
};

const ETIQUETA = { horario: "Horario", direccion: "Dirección", pagos: "Formas de pago", envios: "Envíos", garantia: "Garantía", cuentas: "Cuentas bancarias" } as const;

/** Las cuentas activas, una por línea, para el resumen del pedido y la variable {cuentas}. */
export const textoCuentas = (cuentas: readonly { banco: string; tipo: "monetaria" | "ahorro"; numero: string; titular: string; activa: boolean }[]) =>
  cuentas.filter((c) => c.activa).map((c) => `${c.banco} · ${c.tipo === "ahorro" ? "Ahorro" : "Monetaria"} ${c.numero} · ${c.titular}`).join("\n");

/**
 * Rellena {negocio}, {horario}, {direccion}, {pagos}, {envios}, {garantia} y {cuentas} en una respuesta rápida con los datos del negocio.
 * Si un dato todavía no se ha escrito en Ajustes, queda un marcador visible para que nadie lo mande por error.
 */
export function aplicarDatos(texto: string, d: DatosNegocio) {
  return texto.replace(/\{(negocio|horario|direccion|pagos|envios|garantia|cuentas)\}/g, (_, clave: "negocio" | keyof typeof ETIQUETA) => {
    if (clave === "negocio") return d.nombre;
    return d[clave]?.trim() || `[${ETIQUETA[clave]}: pendiente de confirmar]`;
  });
}
