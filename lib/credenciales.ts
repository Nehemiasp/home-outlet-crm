import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { descifrar, huellaRespaldo, pareceRespaldo, verificarTotp } from "@/lib/segundo-factor";

// Se compara contra un hash falso cuando el correo no existe, para que la respuesta tarde igual
// y no se pueda saber si el correo está registrado.
const HASH_FALSO = bcrypt.hashSync("no-es-una-clave", 10);

/** El usuario si el correo y la contraseña son correctos y está activo; si no, null (sin decir cuál de las cosas falló). */
export async function verificarClave(correo: string, password: string) {
  const usuario = await db.user.findUnique({ where: { correo } });
  const ok = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FALSO);
  return usuario && usuario.activo && ok ? usuario : null;
}

/**
 * Comprueba el segundo factor al entrar: el código de la aplicación (que no se haya usado ya) o, si se perdió el teléfono, un código de
 * respaldo (que se gasta). Cada uno se marca como usado en una sola operación, así dos entradas a la vez no lo aprovechan las dos.
 */
export async function verificarSegundoFactor(u: { id: string; totpSecreto: string | null; totpUltimoPaso: number }, codigo: string): Promise<boolean> {
  const texto = codigo.trim();
  if (!u.totpSecreto || !texto) return false;
  if (pareceRespaldo(texto)) {
    const huella = huellaRespaldo(texto);
    const gastado = await db.$executeRaw`UPDATE "User" SET "respaldoHashes" = array_remove("respaldoHashes", ${huella}) WHERE id = ${u.id} AND ${huella} = ANY("respaldoHashes")`;
    return gastado === 1;
  }
  const secreto = descifrar(u.totpSecreto);
  if (!secreto) return false;
  const paso = verificarTotp(secreto, texto, u.totpUltimoPaso);
  if (paso === null) return false;
  const marcado = await db.user.updateMany({ where: { id: u.id, totpUltimoPaso: { lt: paso } }, data: { totpUltimoPaso: paso } });
  return marcado.count === 1;
}
