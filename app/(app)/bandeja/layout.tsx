import { requireUsuario } from "@/lib/session";
import { restringido } from "@/lib/visibilidad";
import { BandejaShell } from "./shell";

export default async function LayoutBandeja({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario();
  return (
    <BandejaShell soloMias={await restringido(usuario)} esAdmin={usuario.rol === "admin"}>
      {children}
    </BandejaShell>
  );
}
