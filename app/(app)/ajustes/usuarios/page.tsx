import type { Metadata } from "next";
import { listarUsuarios } from "@/lib/ajustes";
import { requireUsuario } from "@/lib/session";
import { Usuarios } from "./usuarios";

export const metadata: Metadata = { title: "Usuarios · Ajustes · Home Outlet" };

export default async function Pagina() {
  const yo = await requireUsuario("admin");
  return <Usuarios usuarios={await listarUsuarios()} yoId={yo.id} />;
}
