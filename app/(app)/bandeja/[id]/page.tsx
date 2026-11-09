import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarConversacion } from "@/lib/bandeja";
import { requireUsuario } from "@/lib/session";
import { Vista } from "../vista";

export const metadata: Metadata = { title: "Conversación · Home Outlet" };

export default async function Conversacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cotizacion?: string }> }) {
  const { id } = await params;
  const { cotizacion } = await searchParams; // ?cotizacion=… abre el panel para convertirla en pedido (lo valida el servidor al cargarla)
  const usuario = await requireUsuario();
  const inicial = await cargarConversacion(id, usuario);
  if (!inicial) notFound();
  return <Vista key={id} inicial={inicial} cotizacion={typeof cotizacion === "string" ? cotizacion.slice(0, 40) : null} />;
}
