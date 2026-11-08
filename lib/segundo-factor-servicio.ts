import qrcode from "qrcode-generator";
import { db } from "@/lib/db";
import { cifrar, descifrar, huellaRespaldo, nuevoSecreto, nuevosRespaldos, secretoEnGrupos, uriOtpauth, verificarTotp } from "@/lib/segundo-factor";

/** El QR como imagen lista para un <img> (GIF en una dirección data:). Se arma aquí, sin servicios de fuera: el secreto no sale del servidor. */
export function qrComoImagen(texto: string): string {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  return q.createDataURL(6, 2);
}

/**
 * Empieza (o retoma) la activación del segundo factor de una persona: guarda un secreto PENDIENTE, que solo vale cuando ella lo confirma
 * con un código. Si ya había uno pendiente se reutiliza, para que el QR que escaneó antes siga sirviendo si recarga la página.
 */
export async function iniciarActivacion(usuarioId: string): Promise<{ ok: true; qr: string; secreto: string } | { ok: false; error: string }> {
  const u = await db.user.findUnique({ where: { id: usuarioId }, select: { correo: true, totpSecreto: true, totpPendiente: true } });
  if (!u) return { ok: false, error: "El usuario ya no existe." };
  if (u.totpSecreto) return { ok: false, error: "El segundo factor ya está activo." };
  let secreto = u.totpPendiente ? descifrar(u.totpPendiente) : null;
  if (!secreto) {
    secreto = nuevoSecreto();
    await db.user.update({ where: { id: usuarioId }, data: { totpPendiente: cifrar(secreto) } });
  }
  return { ok: true, qr: qrComoImagen(uriOtpauth(secreto, u.correo)), secreto: secretoEnGrupos(secreto) };
}

/**
 * Confirma la activación con el código que muestra la aplicación. Si es correcto, el secreto pasa a ser el definitivo y se generan los
 * códigos de respaldo, que se devuelven UNA sola vez (en la base queda solo su huella). La sesión actual deja de valer (cambió la huella
 * de credenciales): la persona vuelve a entrar, ya con su código.
 */
export async function confirmarActivacion(usuarioId: string, codigo: string): Promise<{ ok: true; respaldos: string[] } | { ok: false; error: string }> {
  const u = await db.user.findUnique({ where: { id: usuarioId }, select: { totpSecreto: true, totpPendiente: true } });
  if (!u) return { ok: false, error: "El usuario ya no existe." };
  if (u.totpSecreto) return { ok: false, error: "El segundo factor ya está activo." };
  const secreto = u.totpPendiente ? descifrar(u.totpPendiente) : null;
  if (!secreto) return { ok: false, error: "Vuelva a cargar la página para generar un código QR nuevo." };
  const paso = verificarTotp(secreto, codigo, 0);
  if (paso === null) return { ok: false, error: "Ese código no coincide. Revise que la hora de su teléfono sea la automática y escriba el código que se muestra ahora." };
  const respaldos = nuevosRespaldos();
  // Condición en el UPDATE: si dos pestañas confirman a la vez, solo una gana y solo sus códigos de respaldo valen.
  const r = await db.user.updateMany({
    where: { id: usuarioId, totpSecreto: null },
    data: { totpSecreto: u.totpPendiente, totpPendiente: null, totpUltimoPaso: paso, respaldoHashes: respaldos.map(huellaRespaldo) },
  });
  if (r.count !== 1) return { ok: false, error: "El segundo factor ya está activo." };
  return { ok: true, respaldos };
}
