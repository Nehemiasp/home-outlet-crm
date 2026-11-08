import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { inicioDe } from "@/lib/permisos";
import { iniciarActivacion } from "@/lib/segundo-factor-servicio";
import { requireSesionParcial } from "@/lib/session";
import { ActivarSegundoFactor } from "./activar";

export const metadata: Metadata = { title: "Activar segundo factor · Home Outlet" };

// Fuera del marco de la aplicación a propósito: aquí entra quien todavía no tiene el segundo factor y no puede ver nada más.
export default async function Seguridad() {
  const { u, pendiente } = await requireSesionParcial();
  if (!pendiente) redirect(inicioDe(u)); // no le falta nada
  const r = await iniciarActivacion(u.id);
  if (!r.ok) redirect("/login");
  return (
    <main className="grid min-h-dvh place-items-center bg-carbon p-4">
      <div className="w-full max-w-md rounded-tarjeta bg-superficie p-6">
        <div className="mb-6 rounded-campo bg-carbon p-4">
          <Logo sobreOscuro />
        </div>
        <ActivarSegundoFactor nombre={u.nombre} qr={r.qr} secreto={r.secreto} />
      </div>
    </main>
  );
}
