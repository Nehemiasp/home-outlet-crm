"use client";

import { BarChart3, Inbox, LogOut, MoreHorizontal, Package, Settings, ShoppingBag, Truck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pagosPorVerificar } from "@/app/(app)/pedidos/actions";
import { salir } from "@/app/login/actions";
import { Logo } from "@/components/brand/logo";
import { ContadorNoLeidos } from "@/components/ui/etiquetas";
import { AvisoAccionable } from "@/components/ui/estructura";
import { esBodega, puedeDespachar, puedeVerAjustes, puedeVerReportes, veTodo, type Rol } from "@/lib/permisos";
import { useActualizacion } from "@/lib/tiempo-real";
import { useLatido } from "./latido";
import { cn } from "@/lib/utils";

// Bodega solo ve el despacho y el catálogo.
const sinBodega = (u: { rol: Rol }) => !esBodega(u);

const accesos: { href: string; texto: string; icono: typeof Inbox; permiso?: (u: { rol: Rol }) => boolean }[] = [
  { href: "/despacho", texto: "Despacho", icono: Truck, permiso: puedeDespachar },
  { href: "/bandeja", texto: "Bandeja", icono: Inbox, permiso: sinBodega },
  { href: "/pedidos", texto: "Pedidos", icono: ShoppingBag, permiso: sinBodega },
  { href: "/contactos", texto: "Contactos", icono: Users, permiso: sinBodega },
  { href: "/catalogo", texto: "Catálogo", icono: Package },
  { href: "/reportes", texto: "Reportes", icono: BarChart3, permiso: puedeVerReportes },
  { href: "/ajustes", texto: "Ajustes", icono: Settings, permiso: puedeVerAjustes },
];

// La barra inferior del teléfono admite hasta 6 botones. Si no caben, quedan 5 a la vista y un «Más» con el resto.
const MAX_MOVIL = 6;

export function Navegacion({ nombre, rol, porVerificar: verificarInicial, puedeVerificar, avisoPresupuesto }: { nombre: string; rol: Rol; porVerificar: number; puedeVerificar: boolean; avisoPresupuesto?: { porcentaje: number; agotado: boolean } }) {
  const ruta = usePathname();
  const { noLeidos, sinAsignar } = useLatido(); // el latido de la app trae también los contadores
  const { datos: porVerificarVivo } = useActualizacion("por-verificar", puedeVerificar ? pagosPorVerificar : async () => 0, 10_000);
  const porVerificar = puedeVerificar ? (porVerificarVivo ?? verificarInicial) : 0;
  const visibles = accesos.filter((a) => !a.permiso || a.permiso({ rol }));
  const activo = (href: string) => ruta === href || ruta.startsWith(href + "/");

  const cuenta = (href: string) => (href === "/bandeja" ? noLeidos : href === "/pedidos" ? porVerificar : 0);
  const cabenTodos = visibles.length + 1 <= MAX_MOVIL; // los accesos más «Salir»
  const principales = cabenTodos ? visibles : visibles.slice(0, MAX_MOVIL - 2);
  const enMas = cabenTodos ? [] : visibles.slice(MAX_MOVIL - 2);

  const [masAbierto, setMasAbierto] = useState(false);
  const masRef = useRef<HTMLLIElement>(null);
  useEffect(() => setMasAbierto(false), [ruta]);
  useEffect(() => {
    if (!masAbierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => masRef.current && !masRef.current.contains(e.target as Node) && setMasAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setMasAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [masAbierto]);

  return (
    <>
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-carbon text-sobre-carbon md:flex print:hidden">
        <div className="p-6">
          <Logo sobreOscuro />
        </div>
        <nav aria-label="Principal" className="flex-1">
          <ul className="flex flex-col gap-1 px-2">
            {visibles.map(({ href, texto, icono: Icono }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={activo(href) ? "page" : undefined}
                  className={cn(
                    "cuerpo-fuerte flex h-10 items-center gap-3 rounded-campo px-4 transition-colors duration-150 hover:bg-carbon-soft",
                    activo(href) ? "bg-carbon-soft text-sobre-carbon" : "text-sobre-carbon-suave hover:text-sobre-carbon",
                  )}
                >
                  <Icono className="size-5" aria-hidden />
                  {texto}
                  {cuenta(href) > 0 && <ContadorNoLeidos cantidad={cuenta(href)} className="ml-auto" />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-2 px-2 pb-2">
          {veTodo({ rol }) && !!sinAsignar && (
            <AvisoAccionable
              tono="aviso"
              accion={
                <Link href="/bandeja?vista=sin-asignar" className="meta underline underline-offset-2 hover:no-underline">
                  Ver conversaciones
                </Link>
              }
            >
              {sinAsignar === 1 ? "1 conversación sin asignar" : `${sinAsignar} conversaciones sin asignar`}
            </AvisoAccionable>
          )}
          {puedeVerificar && porVerificar > 0 && (
            <AvisoAccionable
              tono="aviso"
              accion={
                <Link href="/pedidos?vista=por-verificar" className="meta underline underline-offset-2 hover:no-underline">
                  Ver pagos
                </Link>
              }
            >
              {porVerificar === 1 ? "Hay 1 pago por verificar" : `Hay ${porVerificar} pagos por verificar`}
            </AvisoAccionable>
          )}
          {avisoPresupuesto && (
            <AvisoAccionable
              tono="aviso"
              accion={
                <Link href="/ajustes/asistente" className="meta underline underline-offset-2 hover:no-underline">
                  Ver ajustes
                </Link>
              }
            >
              {avisoPresupuesto.agotado ? "El asistente se apagó: se agotó el presupuesto del mes" : `El asistente lleva el ${avisoPresupuesto.porcentaje} % del presupuesto del mes`}
            </AvisoAccionable>
          )}
        </div>
        <div className="border-t border-carbon-soft p-4">
          <p className="meta truncate text-sobre-carbon-suave">{nombre}</p>
          <form action={salir}>
            <button type="submit" className="cuerpo-fuerte mt-1 flex h-10 cursor-pointer items-center gap-2 text-sobre-carbon hover:text-naranja">
              <LogOut className="size-4" aria-hidden />
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* Móvil: barra inferior con los mismos accesos */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 bg-carbon md:hidden print:hidden">
        <ul className="flex">
          {principales.map(({ href, texto, icono: Icono }) => (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={activo(href) ? "page" : undefined}
                className={cn(
                  "mini relative flex h-14 flex-col items-center justify-center gap-1",
                  activo(href) ? "bg-carbon-soft text-sobre-carbon" : "text-sobre-carbon-suave",
                )}
              >
                {activo(href) && <span aria-hidden className="absolute inset-x-4 top-0 h-1 rounded-pildora bg-naranja" />}
                <span className="relative">
                  <Icono className="size-5" aria-hidden />
                  {cuenta(href) > 0 && <ContadorNoLeidos cantidad={cuenta(href)} className="absolute -top-2 left-3" />}
                </span>
                {texto}
              </Link>
            </li>
          ))}
          {cabenTodos ? (
            <li className="min-w-0 flex-1">
              <form action={salir}>
                <button type="submit" className="mini flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 text-sobre-carbon-suave">
                  <LogOut className="size-5" aria-hidden />
                  Salir
                </button>
              </form>
            </li>
          ) : (
            <li ref={masRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={masAbierto}
                aria-controls="menu-mas"
                onClick={() => setMasAbierto((v) => !v)}
                className={cn("mini relative flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1", masAbierto || enMas.some((a) => activo(a.href)) ? "bg-carbon-soft text-sobre-carbon" : "text-sobre-carbon-suave")}
              >
                {enMas.some((a) => activo(a.href)) && <span aria-hidden className="absolute inset-x-4 top-0 h-1 rounded-pildora bg-naranja" />}
                <MoreHorizontal className="size-5" aria-hidden />
                Más
              </button>
              {masAbierto && (
                <ul id="menu-mas" className="absolute right-0 bottom-full mb-1 w-48 overflow-hidden rounded-tarjeta bg-carbon py-1 shadow-menu">
                  {enMas.map(({ href, texto, icono: Icono }) => (
                    <li key={href}>
                      <Link href={href} aria-current={activo(href) ? "page" : undefined} className={cn("cuerpo-fuerte flex min-h-11 items-center gap-3 px-4 hover:bg-carbon-soft", activo(href) ? "bg-carbon-soft text-sobre-carbon" : "text-sobre-carbon-suave")}>
                        <Icono className="size-5" aria-hidden />
                        {texto}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <form action={salir}>
                      <button type="submit" className="cuerpo-fuerte flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 text-sobre-carbon-suave hover:bg-carbon-soft">
                        <LogOut className="size-5" aria-hidden />
                        Salir
                      </button>
                    </form>
                  </li>
                </ul>
              )}
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
