import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { puedeDespachar } from "@/lib/permisos";
import { requireConBodega } from "@/lib/session";
import { ListaDespacho } from "./lista";

export const metadata: Metadata = { title: "Despacho · Home Outlet" };

export default async function Pagina() {
  const usuario = await requireConBodega();
  if (!puedeDespachar(usuario)) redirect("/bandeja"); // un asesor no entra aquí
  return <ListaDespacho />;
}
