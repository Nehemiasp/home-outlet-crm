import { requireUsuario } from "@/lib/session";
import { restringido } from "@/lib/visibilidad";
import { BandejaShell } from "./shell";
import { veTodo } from "@/lib/permisos";
import { esCompartida } from "@/lib/equipo/compartida";

export default async function LayoutBandeja({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario();
  return (
    <BandejaShell soloMias={await restringido(usuario)} veTodo={veTodo(usuario)} compartida={await esCompartida()}>
      {children}
    </BandejaShell>
  );
}
