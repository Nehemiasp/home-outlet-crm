import { db } from "@/lib/db";
import { palabras } from "./texto";

export type RespuestaConocida = { pregunta: string; respuesta: string; categoria: string };

/**
 * Busca en las preguntas frecuentes por coincidencia de palabras.
 * Es el único lugar que sabe cómo se busca: para pasar a búsqueda por significado (embeddings) solo se cambia esta función.
 */
export async function buscarConocimiento(pregunta: string, max = 3): Promise<RespuestaConocida[]> {
  const buscadas = new Set(palabras(pregunta));
  if (buscadas.size === 0) return [];
  const items = await db.knowledgeItem.findMany({ where: { activa: true } });
  return items
    .map((i) => {
      const enPregunta = palabras(i.pregunta);
      const enRespuesta = new Set(palabras(i.respuesta));
      // Pesa más coincidir con la pregunta que con el texto de la respuesta.
      const puntos = enPregunta.filter((p) => buscadas.has(p)).length * 2 + [...buscadas].filter((p) => enRespuesta.has(p)).length;
      return { i, puntos };
    })
    .filter((x) => x.puntos >= 2)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, max)
    .map(({ i }) => ({ pregunta: i.pregunta, respuesta: i.respuesta, categoria: i.categoria }));
}
