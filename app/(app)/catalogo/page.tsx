import type { Metadata } from "next";
import { categorias } from "@/lib/catalogo";
import { requireUsuario } from "@/lib/session";
import { Catalogo } from "./lista";

export const metadata: Metadata = { title: "Catálogo · Home Outlet" };

export default async function Pagina() {
  const usuario = await requireUsuario();
  return <Catalogo categorias={await categorias()} esAdmin={usuario.rol === "admin"} />;
}
