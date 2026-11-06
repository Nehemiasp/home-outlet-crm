import type { Metadata } from "next";
import { VISTAS, contarVistas, type Vista } from "@/lib/pedidos/consultas";
import { puedeVerificarPagos } from "@/lib/permisos";
import { listarAsesores } from "@/lib/equipo/asesores";
import { requireUsuario } from "@/lib/session";
import { ListaPedidos } from "./lista";

export const metadata: Metadata = { title: "Pedidos · Home Outlet" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ filtro?: string; vista?: string }> }) {
  const usuario = await requireUsuario();
  const { filtro, vista } = await searchParams;
  // Sin vista en la dirección: «Por verificar» si hay pagos esperando; si no, todos.
  const pedida = (filtro === "por_verificar" ? "por-verificar" : vista) as Vista | undefined;
  const inicial: Vista = pedida && VISTAS.includes(pedida) ? pedida : (await contarVistas(usuario)).porVerificar > 0 ? "por-verificar" : "todos";
  const asesores = usuario.rol === "admin" ? await listarAsesores() : [];
  return <ListaPedidos vistaInicial={inicial} puedeVerificar={puedeVerificarPagos(usuario)} esAdmin={usuario.rol === "admin"} asesores={asesores} />;
}
