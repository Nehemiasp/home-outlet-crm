import { Navegacion } from "@/components/shell/barra";
import { BarraDisponibilidad } from "@/components/shell/barra-disponibilidad";
import { ProveedorLatido } from "@/components/shell/latido";
import { contarSinAsignar } from "@/lib/equipo/asignacion";
import { disponibilidadDe } from "@/lib/equipo/estado";
import { contarNoLeidos } from "@/lib/bandeja";
import { estadoPresupuesto } from "@/lib/ia/ajustes-ia";
import { puedeVerificarPagos } from "@/lib/permisos";
import { contarPorVerificar } from "@/lib/pedidos/consultas";
import { requireUsuario } from "@/lib/session";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "admin";
  const puedeVerificar = puedeVerificarPagos(usuario);
  const [noLeidos, presupuesto, porVerificar, sinAsignar] = await Promise.all([contarNoLeidos(usuario), esAdmin ? estadoPresupuesto() : null, puedeVerificar ? contarPorVerificar(usuario) : 0, esAdmin ? contarSinAsignar() : null]);

  // --alto-barra: la barra superior del asesor ocupa 3 rem; las pantallas de altura completa (la bandeja) la descuentan.
  return (
    <ProveedorLatido inicial={{ noLeidos, sinAsignar, disponibilidad: disponibilidadDe(usuario) }}>
    <div className="flex min-h-dvh" style={{ "--alto-barra": esAdmin ? "0rem" : "3rem" } as React.CSSProperties}>
      <Navegacion
        nombre={usuario.nombre}
        esAdmin={esAdmin}
        porVerificar={porVerificar}
        puedeVerificar={puedeVerificar}
        avisoPresupuesto={presupuesto?.aviso ? { porcentaje: Math.round(presupuesto.porcentaje), agotado: presupuesto.agotado } : undefined}
      />
      <main className="min-w-0 flex-1 pb-14 md:pb-0 print:pb-0">
        {!esAdmin && <BarraDisponibilidad />}
        {children}
      </main>
    </div>
    </ProveedorLatido>
  );
}
