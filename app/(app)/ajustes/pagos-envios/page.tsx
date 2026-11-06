import type { Metadata } from "next";
import { obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { listarCuentas, listarZonas, obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { Cuentas } from "./cuentas";
import { AjustesDePedidos } from "./pedidos";
import { Mensajes } from "./mensajes";
import { Zonas } from "./zonas";
import { configMensajes } from "@/lib/pedidos/avisos";
import { pasarela } from "@/lib/pagos-tarjeta";

export const metadata: Metadata = { title: "Pagos y envíos · Ajustes · Home Outlet" };

export default async function Pagina() {
  const [a, cuentas, zonas, ubicaciones, negocio, mensajes] = await Promise.all([
    obtenerAjustesPedidos(),
    listarCuentas(),
    listarZonas(),
    db.location.findMany({ where: { activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    obtenerNegocio(),
    configMensajes(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AjustesDePedidos
        ubicaciones={ubicaciones}
        tarjetaConectada={!!pasarela()}
        inicial={{
          prefijo: a.prefijo,
          horasReserva: String(a.horasReserva),
          descuentoMaxAgente: String(a.descuentoMaxAgente),
          inventario: a.inventario,
          metodos: a.metodos,
          envioGratis: a.envioGratisDesde !== null,
          envioGratisDesde: a.envioGratisDesde !== null ? (a.envioGratisDesde / 100).toFixed(2) : "",
          ubicacionRecogerId: a.ubicacionRecogerId,
          ubicacionEnvioId: a.ubicacionEnvioId,
        }}
      />
      <Cuentas filas={cuentas.map((c) => ({ id: c.id, banco: c.banco, tipo: c.tipo, numero: c.numero, titular: c.titular, activa: c.activa }))} />
      <Zonas filas={zonas} recoger={{ direccion: negocio.direccion, horario: negocio.horario }} />
      <Mensajes inicial={mensajes} />
    </div>
  );
}
