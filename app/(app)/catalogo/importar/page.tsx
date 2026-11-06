import type { Metadata } from "next";
import { requireUsuario } from "@/lib/session";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar productos · Home Outlet" };

export default async function Importar() {
  await requireUsuario("admin");
  return <Importador />;
}
