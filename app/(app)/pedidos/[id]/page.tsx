import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtener } from "../actions";
import { Detalle } from "./detalle";

export const metadata: Metadata = { title: "Pedido · Home Outlet" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inicial = await obtener(id);
  if (!inicial) notFound();
  return <Detalle key={id} inicial={inicial} />;
}
