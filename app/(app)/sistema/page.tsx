import type { Metadata } from "next";
import { requireUsuario } from "@/lib/session";
import { Guia } from "./guia";

export const metadata: Metadata = { title: "Sistema de diseño · Home Outlet" };

export default async function Sistema() {
  await requireUsuario("admin");
  return <Guia />;
}
