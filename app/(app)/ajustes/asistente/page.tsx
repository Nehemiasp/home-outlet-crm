import type { Metadata } from "next";
import { estadoPresupuesto, obtenerAjustesIa } from "@/lib/ia/ajustes-ia";
import { obtenerProveedor } from "@/lib/ia/proveedor";
import { General } from "./general";

export const metadata: Metadata = { title: "Asistente · Ajustes · Home Outlet" };

export default async function Pagina() {
  const [ajustes, presupuesto] = await Promise.all([obtenerAjustesIa(), estadoPresupuesto()]);
  const p = obtenerProveedor();
  return <General inicial={ajustes} presupuesto={presupuesto} proveedor={{ nombre: p.name, modelo: p.modelo }} />;
}
