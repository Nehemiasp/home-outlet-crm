import type { Metadata } from "next";
import { obtenerAjustesEquipo } from "@/lib/equipo/ajustes";
import { requireUsuario } from "@/lib/session";
import { Equipo } from "./equipo";

export const metadata: Metadata = { title: "Equipo · Ajustes · Home Outlet" };

export default async function Pagina() {
  await requireUsuario("admin");
  return <Equipo inicial={await obtenerAjustesEquipo()} />;
}
