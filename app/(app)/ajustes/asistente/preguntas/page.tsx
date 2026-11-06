import type { Metadata } from "next";
import { listarPreguntas } from "@/lib/ia/preguntas";
import { Preguntas } from "./preguntas";

export const metadata: Metadata = { title: "Preguntas frecuentes · Asistente · Ajustes · Home Outlet" };

export default async function Pagina() {
  const filas = await listarPreguntas();
  return <Preguntas filas={filas.map((p) => ({ id: p.id, pregunta: p.pregunta, respuesta: p.respuesta, categoria: p.categoria, activa: p.activa }))} />;
}
