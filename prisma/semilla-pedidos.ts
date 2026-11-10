// Contenido de Pagos y envíos. Las cuentas son las reales de Home Outlet (las dio el cliente el 10-nov-2026); las zonas siguen de ejemplo.
import type { PrismaClient } from "../generated/prisma/client";
import { TIENDA_MIXCO, TIENDA_PUERTO_BARRIOS } from "../lib/tiendas";

// Las cuentas reales de Home Outlet (10-nov-2026): las dos monetarias, a nombre de la sociedad.
const cuentas = [
  { banco: "Banco Industrial", tipo: "monetaria", numero: "552-009627-1", titular: "Home Outlet Internacional, S.A." },
  { banco: "Banrural", tipo: "monetaria", numero: "3109125249", titular: "Home Outlet Internacional, S.A." },
] as const;

// FICTICIO: hasta que lleguen las zonas y los costos reales (centavos).
const zonas = [
  { nombre: "Puerto Barrios", departamentos: ["Izabal"], municipios: ["Puerto Barrios"], costo: 1500, tiempo: "Mismo día (productos de la tienda de Puerto Barrios)" },
  { nombre: "Morales", departamentos: ["Izabal"], municipios: ["Morales"], costo: 3500, tiempo: "1 a 2 días" },
  { nombre: "Resto de Izabal", departamentos: ["Izabal"], municipios: [], costo: 4000, tiempo: "1 a 2 días" },
  { nombre: "Departamento de Guatemala", departamentos: ["Guatemala"], municipios: [], costo: 4000, tiempo: "Mismo día (productos de la tienda de Mixco)" },
  { nombre: "Resto del país", departamentos: [], municipios: [], costo: 4500, tiempo: "2 a 4 días" },
] as const;

export async function sembrarPedidosBase(db: PrismaClient) {
  const ubicaciones = await db.location.findMany({ select: { id: true, nombre: true } });
  const por = (n: string) => ubicaciones.find((u) => u.nombre === n)?.id ?? null;
  // FICTICIO: 24 horas de reserva, 0 % de descuento para agentes e inventario separado hasta que Home Outlet confirme.
  await db.ajustesPedidos.upsert({
    where: { id: "pedidos" },
    create: { ubicacionRecogerId: por(TIENDA_PUERTO_BARRIOS.nombre), ubicacionEnvioId: por(TIENDA_MIXCO.nombre) },
    update: {},
  });
  await db.bankAccount.createMany({ data: cuentas.map((c, i) => ({ ...c, orden: i + 1 })) });
  await db.shippingZone.createMany({ data: zonas.map((z, i) => ({ ...z, departamentos: [...z.departamentos], municipios: [...z.municipios], orden: i + 1 })) });
}
