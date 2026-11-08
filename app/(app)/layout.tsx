import { Navegacion } from "@/components/shell/barra";
import { BarraDisponibilidad } from "@/components/shell/barra-disponibilidad";
import { ProveedorLatido } from "@/components/shell/latido";
import { contarSinAsignar } from "@/lib/equipo/asignacion";
import { disponibilidadDe } from "@/lib/equipo/estado";
import { contarNoLeidos } from "@/lib/bandeja";
import { estadoPresupuesto } from "@/lib/ia/ajustes-ia";
import { esAdmin as soyAdmin, esBodega, puedeVerificarPagos, veTodo } from "@/lib/permisos";
import { contarPorVerificar } from "@/lib/pedidos/consultas";
import { requireConBodega } from "@/lib/session";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await requireConBodega(); // el marco de la aplicación también lo usa bodega
  const esAdmin = soyAdmin(usuario); // presupuesto del asistente: solo el administrador
  const ventodo = veTodo(usuario); // administrador y jefe de tienda: sin barra de disponibilidad y con el aviso de «sin asignar»
  const puedeVerificar = puedeVerificarPagos(usuario);
  const [noLeidos, presupuesto, porVerificar, sinAsignar] = await Promise.all([esBodega(usuario) ? 0 : contarNoLeidos(usuario), esAdmin ? estadoPresupuesto() : null, puedeVerificar ? contarPorVerificar(usuario) : 0, ventodo ? contarSinAsignar() : null]);

  // --alto-barra: la barra superior del asesor ocupa 3 rem; las pantallas de altura completa (la bandeja) la descuentan.
  return (
    <ProveedorLatido inicial={{ noLeidos, sinAsignar, disponibilidad: disponibilidadDe(usuario) }}>
    <div className="flex min-h-dvh" style={{ "--alto-barra": usuario.rol === "agente" ? "3rem" : "0rem" } as React.CSSProperties}>
      <Navegacion
        nombre={usuario.nombre}
        rol={usuario.rol}
        porVerificar={porVerificar}
        puedeVerificar={puedeVerificar}
        avisoPresupuesto={presupuesto?.aviso ? { porcentaje: Math.round(presupuesto.porcentaje), agotado: presupuesto.agotado } : undefined}
      />
      <main className="min-w-0 flex-1 pb-14 md:pb-0 print:pb-0">
        {usuario.rol === "agente" && <BarraDisponibilidad />}
        {children}
      </main>
    </div>
    </ProveedorLatido>
  );
}
