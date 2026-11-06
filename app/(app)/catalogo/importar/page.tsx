import type { Metadata } from "next";
import { puedeGestionarProductos } from "@/lib/permisos";
import { requirePermiso } from "@/lib/session";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar productos · Home Outlet" };

export default async function Importar() {
  await requirePermiso(puedeGestionarProductos, "/catalogo");
  return <Importador />;
}
