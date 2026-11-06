import type { Metadata } from "next";
import { generarReportes } from "@/lib/reportes";
import { requireUsuario } from "@/lib/session";
import { VistaReportes } from "./vista";

export const metadata: Metadata = { title: "Reportes · Home Outlet" };

const HORA = 3_600_000;
const hoyGt = () => new Date(Date.now() - 6 * HORA).toISOString().slice(0, 10);

export default async function Reportes() {
  await requireUsuario("admin");
  const hasta = hoyGt();
  const desde = new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 29 * 24 * HORA).toISOString().slice(0, 10);
  const inicial = await generarReportes({ desde, hasta, canal: "todos" });
  return <VistaReportes inicial={inicial} />;
}
