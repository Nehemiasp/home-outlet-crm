import { db } from "@/lib/db";

type Resultado = { ok: true } | { ok: false; error: string };

export const listarPreguntas = () => db.knowledgeItem.findMany({ orderBy: [{ categoria: "asc" }, { pregunta: "asc" }] });

export async function guardarPregunta(id: string | null, d: { pregunta: string; respuesta: string; categoria: string; activa: boolean }): Promise<Resultado> {
  const pregunta = d.pregunta.trim();
  const respuesta = d.respuesta.trim();
  const categoria = d.categoria.trim().toLowerCase() || "general";
  if (!pregunta) return { ok: false, error: "Escriba la pregunta." };
  if (!respuesta) return { ok: false, error: "Escriba la respuesta." };
  if (pregunta.length > 300) return { ok: false, error: "La pregunta pasa de 300 caracteres." };
  if (respuesta.length > 1000) return { ok: false, error: "La respuesta pasa de 1000 caracteres. El asistente responde en pocas oraciones." };
  if (categoria.length > 30) return { ok: false, error: "La categoría pasa de 30 caracteres." };
  const datos = { pregunta, respuesta, categoria, activa: d.activa };
  if (id) await db.knowledgeItem.update({ where: { id }, data: datos });
  else await db.knowledgeItem.create({ data: datos });
  return { ok: true };
}

export const borrarPregunta = async (id: string): Promise<Resultado> => (await db.knowledgeItem.deleteMany({ where: { id } }), { ok: true });

export const alternarPregunta = async (id: string, activa: boolean): Promise<Resultado> => (await db.knowledgeItem.updateMany({ where: { id }, data: { activa } }), { ok: true });
