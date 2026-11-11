/**
 * Registro de errores del servidor: una línea JSON por evento en la salida estándar, que es lo que cualquier hosting
 * (Railway, Docker, un servicio de logs) recoge y deja buscar. Nunca se guarda el contenido de los mensajes ni de
 * los datos del cliente: de un error solo salen su tipo y su código (por ejemplo, el de Prisma), no su texto. La excepción
 * son los errores marcados como seguros (`ErrorDeCanal`): su texto es la respuesta de la API del canal, sin datos del cliente.
 * Si algún día se usa un servicio de errores (Sentry y similares), es el único lugar a cambiar.
 */
export function registrarError(contexto: string, error: unknown, o: { nivel?: "error" | "aviso" } = {}) {
  const nivel = o.nivel ?? "error";
  const base = { nivel, hora: new Date().toISOString(), contexto };
  const seguro = error instanceof Error && (error as { seguro?: unknown }).seguro === true;
  const detalle =
    typeof error === "string" ? { mensaje: error.slice(0, 200) }
    : error instanceof Error ? { tipo: error.name, codigo: (error as { code?: unknown }).code, ...(seguro ? { mensaje: error.message.slice(0, 300) } : {}) }
    : { tipo: "desconocido" };
  (nivel === "error" ? console.error : console.warn)(JSON.stringify({ ...base, ...detalle }));
}
