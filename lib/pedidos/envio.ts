import { normalizar } from "../guatemala";

export type Zona = { id: string; nombre: string; departamentos: string[]; municipios: string[]; costo: number; tiempo: string; activa: boolean };

/**
 * La zona de un lugar de entrega, de la más precisa a la más general (en cada nivel gana la primera de la lista):
 * 1. la que lista el municipio (y, si la zona fija departamentos, que el lugar esté en uno de ellos);
 * 2. la que cubre el departamento entero (sin municipios);
 * 3. la zona activa sin departamentos ni municipios, que hace de «resto del país».
 * Los nombres se comparan sin mayúsculas ni tildes. Sin ninguna devuelve null.
 */
export function zonaPara(zonas: readonly Zona[], departamento: string | null | undefined, municipio: string | null | undefined): Zona | null {
  const activas = zonas.filter((z) => z.activa);
  const d = departamento ? normalizar(departamento) : "";
  const m = municipio ? normalizar(municipio) : "";
  const enDepartamento = (z: Zona) => z.departamentos.length === 0 || (!!d && z.departamentos.some((x) => normalizar(x) === d));
  return (
    (m ? activas.find((z) => z.municipios.some((x) => normalizar(x) === m) && enDepartamento(z)) : undefined) ??
    (d ? activas.find((z) => z.municipios.length === 0 && z.departamentos.some((x) => normalizar(x) === d)) : undefined) ??
    activas.find((z) => z.municipios.length === 0 && z.departamentos.length === 0) ??
    null
  );
}

/** Lo que cubre una zona, en una línea: «Todo Izabal», «Morales, Los Amates (Izabal)» o «Resto del país». */
export function describirZona(z: Pick<Zona, "departamentos" | "municipios">): string {
  if (z.municipios.length > 0) return z.municipios.join(", ") + (z.departamentos.length ? ` (${z.departamentos.join(", ")})` : "");
  if (z.departamentos.length > 0) return `Todo ${z.departamentos.length > 1 ? `${z.departamentos.slice(0, -1).join(", ")} y ${z.departamentos.at(-1)}` : z.departamentos[0]}`;
  return "Resto del país";
}

/** Costo de envío en centavos: 0 si el subtotal alcanza el mínimo de envío gratis (cuando está encendido). */
export const costoEnvio = (zona: Pick<Zona, "costo">, subtotal: number, envioGratisDesde: number | null) =>
  envioGratisDesde !== null && subtotal >= envioGratisDesde ? 0 : zona.costo;
