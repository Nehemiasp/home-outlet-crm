import type { Metadata } from "next";
import { generarReportes } from "@/lib/reportes";
import { puedeVerReporteAsesores, puedeVerReportes } from "@/lib/permisos";
import { requirePermiso } from "@/lib/session";
import { VistaReportes } from "./vista";

export const metadata: Metadata = { title: "Reportes · Home Outlet" };

const HORA = 3_600_000;
const hoyGt = () => new Date(Date.now() - 6 * HORA).toISOString().slice(0, 10);

export default async function Reportes() {
  const u = await requirePermiso(puedeVerReportes);
  const asesores = puedeVerReporteAsesores(u);
  const hasta = hoyGt();
  const desde = new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 29 * 24 * HORA).toISOString().slice(0, 10);
  const inicial = await generarReportes({ desde, hasta, canal: "todos" }, { asesores });
  return <VistaReportes inicial={inicial} verAsesores={asesores} />;
}
