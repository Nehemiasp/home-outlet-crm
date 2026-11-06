import type { Metadata } from "next";
import { obtenerNegocio } from "@/lib/ajustes";
import { Negocio } from "./negocio";

export const metadata: Metadata = { title: "Datos del negocio · Ajustes · Home Outlet" };

export default async function Pagina() {
  const n = await obtenerNegocio();
  return (
    <Negocio
      inicial={{ nombre: n.nombre, horario: n.horario ?? "", direccion: n.direccion ?? "", pagos: n.pagos ?? "", envios: n.envios ?? "", garantia: n.garantia ?? "", horarioSemanal: n.horarioSemanal }}
    />
  );
}
