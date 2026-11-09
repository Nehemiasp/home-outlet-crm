import type { Metadata } from "next";
import { VISTAS, contarVistas, type Vista } from "@/lib/pedidos/consultas";
import { puedeVerificarPagos, veTodo } from "@/lib/permisos";
import { listarAsesores } from "@/lib/equipo/asesores";
import { requireUsuario } from "@/lib/session";
import { ListaPedidos, type Pestana } from "./lista";

export const metadata: Metadata = { title: "Pedidos · Home Outlet" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ filtro?: string; vista?: string }> }) {
  const usuario = await requireUsuario();
  const { filtro, vista } = await searchParams;
  // Sin vista en la dirección: «Por verificar» si hay pagos esperando; si no, todos. «cotizaciones» es la pestaña de cotizaciones.
  const pedida = (filtro === "por_verificar" ? "por-verificar" : vista) as Vista | undefined;
  const inicial: Pestana = vista === "cotizaciones" ? "cotizaciones" : pedida && VISTAS.includes(pedida) ? pedida : (await contarVistas(usuario)).porVerificar > 0 ? "por-verificar" : "todos";
  const asesores = veTodo(usuario) ? await listarAsesores() : [];
  return <ListaPedidos vistaInicial={inicial} puedeVerificar={puedeVerificarPagos(usuario)} veTodo={veTodo(usuario)} asesores={asesores} />;
}
