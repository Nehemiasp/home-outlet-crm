// Revisión del entorno al arrancar en producción (instrumentation.ts): se niega a arrancar con secretos de desarrollo
// o con un canal activado a medias, y avisa de lo que queda apagado. Función pura para poder probarla.

type Env = Record<string, string | undefined>;
export type Revision = { errores: string[]; avisos: string[] };

const lleno = (v: string | undefined) => !!v?.trim();

export function revisarEntorno(env: Env): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];
  const permitirDesarrollo = env.PERMITIR_CLAVE_DE_DESARROLLO === "1"; // solo para probar la versión de producción en la propia computadora

  const secreto = env.AUTH_SECRET?.trim() ?? "";
  if (secreto.length < 32 || /genere|cambie|secret|ejemplo/i.test(secreto)) errores.push("AUTH_SECRET falta o es débil: use uno propio de 32 caracteres o más (npx auth secret).");

  const bd = env.DATABASE_URL ?? "";
  if (!lleno(bd)) errores.push("DATABASE_URL falta.");
  else if (/\/\/postgres:postgres@/.test(bd) && !permitirDesarrollo) errores.push("DATABASE_URL usa la clave de desarrollo (postgres:postgres): cree una base con su propia clave.");

  const canales = (env.CHANNELS_ENABLED ?? "").split(",").map((c) => c.trim().toLowerCase());
  if (canales.includes("simulado")) avisos.push("CHANNELS_ENABLED incluye «simulado»: en producción el canal simulado no se usa.");
  const credenciales: Record<string, [string, string[]]> = {
    whatsapp: ["WhatsApp", ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]],
    facebook: ["Facebook", ["FACEBOOK_PAGE_TOKEN", "FACEBOOK_PAGE_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_VERIFY_TOKEN"]],
    instagram: ["Instagram", ["INSTAGRAM_TOKEN", "INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_VERIFY_TOKEN"]],
  };
  for (const [canal, [nombre, variables]] of Object.entries(credenciales)) {
    if (!canales.includes(canal)) continue;
    const falta = variables.filter((k) => !lleno(env[k]));
    if (falta.length) errores.push(`${nombre} está activado pero faltan: ${falta.join(", ")}.`);
  }

  if (env.AI_PROVIDER === "anthropic" && !lleno(env.ANTHROPIC_API_KEY)) errores.push("AI_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY.");
  if (env.AI_PROVIDER !== "anthropic") avisos.push("El asistente corre con el proveedor simulado (AI_PROVIDER no es «anthropic»).");

  if (!lleno(env.TAREAS_SECRET)) avisos.push("TAREAS_SECRET está vacío: las rutas de cron (vencer reservas y desconectar asesores) están apagadas.");
  else if ((env.TAREAS_SECRET ?? "").length < 24) avisos.push("TAREAS_SECRET es corto: use 24 caracteres o más.");
  if (!(Number.parseInt(env.PROXIES_CONFIABLES ?? "0", 10) > 0)) avisos.push("PROXIES_CONFIABLES no está definido: el inicio de sesión se limita solo por correo, no por IP. Si hay un proxy delante, ponga cuántos (normalmente 1).");
  if (!lleno(env.AUTH_URL) && env.AUTH_TRUST_HOST !== "true") avisos.push("Detrás de un proxy, defina AUTH_URL (la dirección pública) o AUTH_TRUST_HOST=true, o el inicio de sesión falla.");

  return { errores, avisos };
}
