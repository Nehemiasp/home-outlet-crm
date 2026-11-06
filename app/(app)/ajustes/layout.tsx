import { requireUsuario } from "@/lib/session";
import { Secciones } from "./secciones";

export default async function LayoutAjustes({ children }: { children: React.ReactNode }) {
  await requireUsuario("admin");
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="titulo-pagina">Ajustes</h1>
      <Secciones />
      {children}
    </div>
  );
}
