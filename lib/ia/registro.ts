import { db } from "@/lib/db";
import type { ResultadoIa } from "@/generated/prisma/client";
import { costoEstimadoUsd } from "./proveedor";
import type { AiProvider, UsoIa } from "./tipos";

/** Deja constancia de cada llamada al proveedor: tokens, costo, tiempo, herramientas y resultado. Nunca guarda la clave ni logs de texto. */
export function registrarRun(p: {
  conversacionId: string | null;
  tipo: "respuesta" | "sugerencia" | "resumen" | "motivo" | "prueba";
  proveedor: AiProvider;
  uso?: UsoIa;
  ms?: number;
  herramientas?: string[];
  consultado?: string[];
  productos?: string[];
  resultado: ResultadoIa;
  sinRespuesta?: boolean;
}) {
  const uso = p.uso ?? { inputTokens: 0, outputTokens: 0 };
  return db.aiRun.create({
    data: {
      conversacionId: p.conversacionId,
      tipo: p.tipo,
      proveedor: p.proveedor.name,
      modelo: p.proveedor.modelo,
      tokensEntrada: uso.inputTokens,
      tokensSalida: uso.outputTokens,
      costoUsd: costoEstimadoUsd(p.proveedor.name, uso),
      ms: p.ms ?? 0,
      herramientas: p.herramientas ?? [],
      consultado: p.consultado ?? [],
      productos: p.productos ?? [],
      resultado: p.resultado,
      sinRespuesta: p.sinRespuesta ?? false,
    },
  });
}
