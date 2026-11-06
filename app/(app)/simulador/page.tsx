import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/session";
import { Simulador } from "./simulador";

export const metadata: Metadata = { title: "Simulador · Home Outlet" };

export default async function Pagina() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUsuario("admin");
  const contactos = await db.contact.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, telefono: true } });
  return <Simulador contactosIniciales={contactos} />;
}
