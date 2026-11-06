import type { Metadata } from "next";
import { categorias, ubicaciones } from "@/lib/catalogo";
import { puedeGestionarProductos } from "@/lib/permisos";
import { requirePermiso } from "@/lib/session";
import { FormularioProducto } from "../formulario";

export const metadata: Metadata = { title: "Nuevo producto · Home Outlet" };

export default async function Nuevo() {
  await requirePermiso(puedeGestionarProductos, "/catalogo");
  return <FormularioProducto categorias={await categorias()} ubicaciones={await ubicaciones()} />;
}
