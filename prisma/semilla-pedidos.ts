// Contenido de demostración de Pagos y envíos. Las cuentas llevan número de puros ceros: nunca un formato que parezca una cuenta real.
import type { PrismaClient } from "../generated/prisma/client";

// FICTICIO: hasta que lleguen los bancos y cuentas reales.
const cuentas = [
  { banco: "Banco Industrial", tipo: "monetaria", numero: "000-000000-0", titular: "Home Outlet Internacional, S.A." },
  { banco: "Banrural", tipo: "ahorro", numero: "0000-000000-0", titular: "Home Outlet Internacional, S.A." },
  { banco: "BAC Credomatic", tipo: "monetaria", numero: "00-000000-0", titular: "Home Outlet Internacional, S.A." },
] as const;

// FICTICIO: hasta que lleguen las zonas y los costos reales (centavos).
const zonas = [
  { nombre: "Puerto Barrios", departamentos: ["Izabal"], municipios: ["Puerto Barrios"], costo: 1500, tiempo: "Mismo día" },
  { nombre: "Morales", departamentos: ["Izabal"], municipios: ["Morales"], costo: 3500, tiempo: "1 a 2 días" },
  { nombre: "Resto de Izabal", departamentos: ["Izabal"], municipios: [], costo: 4000, tiempo: "1 a 2 días" },
  { nombre: "Departamento de Guatemala", departamentos: ["Guatemala"], municipios: [], costo: 4000, tiempo: "1 a 2 días" },
  { nombre: "Resto del país", departamentos: [], municipios: [], costo: 4500, tiempo: "2 a 4 días" },
] as const;

export async function sembrarPedidosBase(db: PrismaClient) {
  const ubicaciones = await db.location.findMany({ select: { id: true, nombre: true } });
  const por = (n: string) => ubicaciones.find((u) => u.nombre === n)?.id ?? null;
  // FICTICIO: 24 horas de reserva, 0 % de descuento para agentes e inventario separado hasta que Home Outlet confirme.
  await db.ajustesPedidos.upsert({
    where: { id: "pedidos" },
    create: { ubicacionRecogerId: por("Tienda física"), ubicacionEnvioId: por("Tienda en línea") },
    update: {},
  });
  await db.bankAccount.createMany({ data: cuentas.map((c, i) => ({ ...c, orden: i + 1 })) });
  await db.shippingZone.createMany({ data: zonas.map((z, i) => ({ ...z, departamentos: [...z.departamentos], municipios: [...z.municipios], orden: i + 1 })) });
}
