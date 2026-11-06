import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarConversacion } from "@/lib/bandeja";
import { requireUsuario } from "@/lib/session";
import { Vista } from "../vista";

export const metadata: Metadata = { title: "Conversación · Home Outlet" };

export default async function Conversacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireUsuario();
  const inicial = await cargarConversacion(id, usuario);
  if (!inicial) notFound();
  return <Vista key={id} inicial={inicial} />;
}
