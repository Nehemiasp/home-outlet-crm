import type { Metadata } from "next";
import { categorias } from "@/lib/catalogo";
import { puedeAjustarExistencias, puedeGestionarProductos } from "@/lib/permisos";
import { requireConBodega } from "@/lib/session";
import { Catalogo } from "./lista";

export const metadata: Metadata = { title: "Catálogo · Home Outlet" };

export default async function Pagina() {
  const usuario = await requireConBodega(); // bodega también lo ve (solo mirar)
  return <Catalogo categorias={await categorias()} puedeGestionar={puedeGestionarProductos(usuario)} puedeAjustar={puedeAjustarExistencias(usuario)} />;
}
