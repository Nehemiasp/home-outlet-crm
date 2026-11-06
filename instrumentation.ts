import type { Instrumentation } from "next";

// Al arrancar el servidor en producción revisa el entorno y se niega a seguir si hay secretos de desarrollo o un canal a medias.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { revisarEntorno } = await import("@/lib/entorno");
  const { errores, avisos } = revisarEntorno(process.env);
  for (const a of avisos) console.warn(JSON.stringify({ nivel: "aviso", contexto: "entorno", mensaje: a }));
  if (errores.length) throw new Error(`Configuración de producción incorrecta:\n- ${errores.join("\n- ")}`);
}

// Cada error del servidor (página, acción o ruta) queda en una línea JSON, sin el texto del error ni los datos del cliente.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { registrarError } = await import("@/lib/registro");
  registrarError(`${request.method} ${context.routePath}`, err);
};
