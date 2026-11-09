import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AvisoAccionable } from "@/components/ui/estructura";
import { COOKIE_SALIDA, MINUTOS_INACTIVIDAD } from "@/lib/inactividad";
import { inicioDe } from "@/lib/permisos";
import { getSesion } from "@/lib/session";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar · Home Outlet" };

export default async function Login() {
  const s = await getSesion();
  if (s) redirect(s.pendiente ? "/seguridad" : inicioDe(s.u)); // con el segundo factor pendiente, a activarlo
  const motivo = (await cookies()).get(COOKIE_SALIDA)?.value; // «inactividad» = la cerró el sistema (ver salir en ./actions.ts)
  return (
    <main className="grid min-h-dvh place-items-center bg-carbon p-4">
      <div className="w-full max-w-sm rounded-tarjeta bg-superficie p-6">
        <div className="mb-6 rounded-campo bg-carbon p-4">
          <Logo sobreOscuro />
        </div>
        <h1 className="titulo-panel mb-4">Entrar</h1>
        {motivo === "inactividad" && (
          <AvisoAccionable tono="info" className="mb-4">
            Su sesión se cerró tras {MINUTOS_INACTIVIDAD} minutos sin usar el sistema. Vuelva a entrar.
          </AvisoAccionable>
        )}
        <FormularioLogin />
      </div>
    </main>
  );
}
