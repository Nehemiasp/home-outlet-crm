import type { Metadata } from "next";
import { listarEtiquetas } from "@/lib/ajustes";
import { Etiquetas } from "./etiquetas";

export const metadata: Metadata = { title: "Etiquetas · Ajustes · Home Outlet" };

export default async function Pagina() {
  return <Etiquetas filas={await listarEtiquetas()} />;
}
