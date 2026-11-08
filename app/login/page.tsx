import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { inicioDe } from "@/lib/permisos";
import { getSesion } from "@/lib/session";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar · Home Outlet" };

export default async function Login() {
  const s = await getSesion();
  if (s) redirect(s.pendiente ? "/seguridad" : inicioDe(s.u)); // con el segundo factor pendiente, a activarlo
  return (
    <main className="grid min-h-dvh place-items-center bg-carbon p-4">
      <div className="w-full max-w-sm rounded-tarjeta bg-superficie p-6">
        <div className="mb-6 rounded-campo bg-carbon p-4">
          <Logo sobreOscuro />
        </div>
        <h1 className="titulo-panel mb-4">Entrar</h1>
        <FormularioLogin />
      </div>
    </main>
  );
}
