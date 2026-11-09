import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

/** ¿Algún valor del filtro quedó `undefined`? (también dentro de AND/OR y de relaciones). */
function tieneIndefinido(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(tieneIndefinido);
  if (v === null || typeof v !== "object" || v instanceof Date) return false;
  return Object.values(v).some((x) => x === undefined || tieneIndefinido(x));
}

/**
 * Las pruebas (`node --test`, que pone NODE_TEST_CONTEXT) usan la base de desarrollo. En Prisma un filtro con `undefined` no
 * filtra: `deleteMany({ where: { contactoId: undefined } })` borra TODAS las filas. Pasa cuando falla el `before` de una prueba y
 * su `after` limpia con un id que nunca se creó (así se borraron las conversaciones de la demostración el 9-nov-2026).
 * Durante las pruebas, un borrado o una actualización masiva con un filtro así se detiene con un error. La aplicación no cambia.
 */
function crear(): PrismaClient {
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  if (!process.env.NODE_TEST_CONTEXT) return base;
  const revisar = (model: string, op: string, where: unknown) => {
    if (tieneIndefinido(where)) throw new Error(`${model}.${op}: el filtro tiene un valor undefined y alcanzaría todas las filas. No se hizo nada.`);
  };
  return base.$extends({
    query: {
      $allModels: {
        deleteMany: ({ model, args, query }) => (revisar(model, "deleteMany", args?.where), query(args)),
        updateMany: ({ model, args, query }) => (revisar(model, "updateMany", args?.where), query(args)),
        updateManyAndReturn: ({ model, args, query }) => (revisar(model, "updateManyAndReturn", args?.where), query(args)),
      },
    },
  }) as unknown as PrismaClient; // solo agrega revisiones: la forma del cliente es la misma
}

export const db = g.prisma ?? crear();

if (process.env.NODE_ENV !== "production") g.prisma = db;
