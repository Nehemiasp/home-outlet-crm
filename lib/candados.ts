import { db } from "@/lib/db";

/**
 * Candados compartidos entre procesos, guardados en la base (tabla `Candado`).
 * Sirven para dos cosas: «como máximo una vez cada N segundos» (se toma y no se suelta) y «solo uno a la vez»
 * (se toma y se suelta al terminar). Si el proceso se cae con el candado puesto, vence solo al pasar `ms`.
 * Es atómico: de dos procesos que lo piden a la vez, solo uno lo obtiene. Usa la hora de la base, no la del proceso.
 */
export async function tomarCandado(clave: string, ms: number): Promise<boolean> {
  const filas = await db.$executeRaw`
    INSERT INTO "Candado" ("clave", "hasta") VALUES (${clave}, now() + make_interval(secs => ${ms / 1000}::double precision))
    ON CONFLICT ("clave") DO UPDATE SET "hasta" = EXCLUDED."hasta" WHERE "Candado"."hasta" <= now()`;
  return filas > 0;
}

export const soltarCandado = (clave: string) => db.candado.deleteMany({ where: { clave } }).then(() => undefined);
