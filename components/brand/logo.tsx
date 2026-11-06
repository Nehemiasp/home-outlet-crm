import { cn } from "@/lib/utils";

/**
 * Marcador de posición hasta que existan los archivos en public/brand/
 * (versión para fondo oscuro y para fondo claro). Al llegar, reemplazar por <Image>.
 */
export function Logo({ sobreOscuro = false, className }: { sobreOscuro?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-col leading-none", sobreOscuro ? "text-sobre-carbon" : "text-carbon", className)}>
      <span className="font-titulo text-[20px] leading-6 tracking-wide">HOME</span>
      <span className={cn("cuerpo-fuerte", sobreOscuro ? "text-naranja" : "text-naranja-texto")}>Outlet</span>
    </span>
  );
}
