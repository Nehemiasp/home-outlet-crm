const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type Zona = { id: string; nombre: string; municipios: string[]; costo: number; tiempo: string; activa: boolean };

/**
 * La zona de un municipio: la que lo lista (sin importar mayúsculas ni tildes) o, si ninguna,
 * la zona activa sin municipios, que hace de "resto del país". Sin ninguna de las dos devuelve null.
 */
export function zonaPara(zonas: readonly Zona[], municipio: string | null | undefined): Zona | null {
  const activas = zonas.filter((z) => z.activa);
  const m = municipio ? normalizar(municipio) : "";
  return (m ? activas.find((z) => z.municipios.some((x) => normalizar(x) === m)) : undefined) ?? activas.find((z) => z.municipios.length === 0) ?? null;
}

/** Costo de envío en centavos: 0 si el subtotal alcanza el mínimo de envío gratis (cuando está encendido). */
export const costoEnvio = (zona: Pick<Zona, "costo">, subtotal: number, envioGratisDesde: number | null) =>
  envioGratisDesde !== null && subtotal >= envioGratisDesde ? 0 : zona.costo;
