import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listarAsesores } from "@/lib/equipo/asesores";
import { requireUsuario } from "@/lib/session";
import { ListaContactos } from "./lista";

export const metadata: Metadata = { title: "Contactos · Home Outlet" };

export default async function Contactos() {
  const usuario = await requireUsuario();
  const etiquetas = await db.tag.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
  const asesores = usuario.rol === "admin" ? await listarAsesores() : [];
  return <ListaContactos etiquetas={etiquetas} asesores={asesores} esAdmin={usuario.rol === "admin"} />;
}
