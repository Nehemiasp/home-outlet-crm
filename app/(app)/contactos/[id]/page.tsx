import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarContacto } from "@/lib/contactos";
import { puedeUnirContactos } from "@/lib/permisos";
import { requireUsuario } from "@/lib/session";
import { PaginaContacto } from "./pagina";

export const metadata: Metadata = { title: "Contacto · Home Outlet" };

export default async function Contacto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireUsuario();
  const inicial = await cargarContacto(id, usuario);
  if (!inicial) notFound();
  return <PaginaContacto key={id} inicial={inicial} puedeUnir={puedeUnirContactos(usuario)} />;
}
