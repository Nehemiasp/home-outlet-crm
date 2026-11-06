import type { Metadata } from "next";
import { listarRespuestas } from "@/lib/ajustes";
import { Respuestas } from "./respuestas";

export const metadata: Metadata = { title: "Respuestas rápidas · Ajustes · Home Outlet" };

export default async function Pagina() {
  const filas = await listarRespuestas();
  return <Respuestas filas={filas.map((r) => ({ id: r.id, atajo: r.atajo, texto: r.texto }))} />;
}
