import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarProducto, categorias, ubicaciones } from "@/lib/catalogo";
import { puedeGestionarProductos } from "@/lib/permisos";
import { requirePermiso } from "@/lib/session";
import { FormularioProducto } from "../formulario";

export const metadata: Metadata = { title: "Editar producto · Home Outlet" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermiso(puedeGestionarProductos, "/catalogo");
  const producto = await cargarProducto(id);
  if (!producto) notFound();
  return <FormularioProducto key={id} producto={producto} categorias={await categorias()} ubicaciones={await ubicaciones()} />;
}
