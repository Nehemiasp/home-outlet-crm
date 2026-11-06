import type { Metadata } from "next";
import { obtenerAjustesIa } from "@/lib/ia/ajustes-ia";
import { Probar } from "./probar";

export const metadata: Metadata = { title: "Probar al asistente · Ajustes · Home Outlet" };

export default async function Pagina() {
  const a = await obtenerAjustesIa();
  return <Probar bienvenida={a.bienvenida} />;
}
