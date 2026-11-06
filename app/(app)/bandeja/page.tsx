import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { EstadoVacio } from "@/components/ui/estados";

export const metadata: Metadata = { title: "Bandeja · Home Outlet" };

export default function Bandeja() {
  return (
    <div className="grid flex-1 place-items-center bg-fondo">
      <EstadoVacio icono={MessageSquare} titulo="Elija una conversación" descripcion="Seleccione una de la lista para leerla y responder." />
    </div>
  );
}
