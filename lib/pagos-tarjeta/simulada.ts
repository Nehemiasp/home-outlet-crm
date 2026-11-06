import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { EventoPasarela, Pasarela } from "./tipos";

/**
 * Pasarela de prueba: no mueve dinero. El «proveedor» es la página /pagar/<id> de este mismo sistema, donde quien prueba elige
 * «Pagar» o «Rechazar»; esa página avisa con un evento firmado igual que lo haría un proveedor real. Solo existe fuera de
 * producción (ver index.ts) y se activa con PASARELA=simulada.
 */
export const CABECERA_FIRMA = "x-pasarela-firma";

/** Secreto de la firma: PASARELA_SECRETO, o uno derivado de AUTH_SECRET para no pedir otra variable en desarrollo. */
const secreto = () => process.env.PASARELA_SECRETO || createHmac("sha256", process.env.AUTH_SECRET ?? "desarrollo").update("pasarela-simulada").digest("hex");
export const firmar = (cuerpo: string) => createHmac("sha256", secreto()).update(cuerpo).digest("hex");

/** El cuerpo y la firma con que «el proveedor» avisa de un cobro. */
export function eventoFirmado(e: EventoPasarela) {
  const cuerpo = JSON.stringify(e);
  return { cuerpo, firma: firmar(cuerpo) };
}

const esquema = z.object({ externoId: z.string().min(1).max(100), estado: z.enum(["pagado", "fallido"]), monto: z.number().int().min(0), referencia: z.string().max(100).optional() });

export const baseUrl = () => (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");

export const pasarelaSimulada: Pasarela = {
  nombre: "simulada",
  async crearCobro() {
    const externoId = `sim_${randomUUID()}`;
    return { externoId, url: `${baseUrl()}/pagar/${externoId}` };
  },
  verificarWebhook(cuerpo, cabeceras) {
    const dada = Buffer.from(cabeceras.get(CABECERA_FIRMA) ?? "", "hex");
    const esperada = Buffer.from(firmar(cuerpo), "hex");
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
  },
  interpretarWebhook(cuerpo) {
    try {
      const p = esquema.safeParse(JSON.parse(cuerpo));
      return p.success ? p.data : null;
    } catch {
      return null;
    }
  },
};
