import type { Metadata } from "next";
import { categorias, ubicaciones } from "@/lib/catalogo";
import { requireUsuario } from "@/lib/session";
import { FormularioProducto } from "../formulario";

export const metadata: Metadata = { title: "Nuevo producto · Home Outlet" };

export default async function Nuevo() {
  await requireUsuario("admin");
  return <FormularioProducto categorias={await categorias()} ubicaciones={await ubicaciones()} />;
}
