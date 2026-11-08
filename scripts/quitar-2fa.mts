// Quita el segundo factor de una persona desde el servidor, para cuando el ÚNICO administrador perdió su teléfono y sus códigos de respaldo
// (con otro administrador disponible, se hace desde Ajustes → Usuarios → Quitar segundo factor).
//   npm run admin:sin-2fa -- --correo persona@empresa.com
// Cierra sus sesiones abiertas; al volver a entrar con su contraseña tiene que activarlo otra vez. Quien corra esto ya tiene acceso al servidor.
import "dotenv/config";
import { z } from "zod";
import { db } from "../lib/db";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const entrada = z.object({ correo: z.string().trim().toLowerCase().pipe(z.email()) }).safeParse({ correo: arg("--correo") });
if (!entrada.success) {
  console.error("\n✖ Uso: npm run admin:sin-2fa -- --correo persona@empresa.com\n");
  process.exit(1);
}
const { correo } = entrada.data;
const u = await db.user.findUnique({ where: { correo } });
if (!u) {
  console.error(`\n✖ No existe un usuario con el correo ${correo}. No se cambió nada.\n`);
  await db.$disconnect();
  process.exit(1);
}
await db.user.update({ where: { id: u.id }, data: { totpSecreto: null, totpPendiente: null, totpUltimoPaso: 0, respaldoHashes: [] } });
await db.activityLog.create({ data: { accion: "quitar_segundo_factor", entidad: "User", entidadId: u.id, detalle: { correo, por: "script del servidor" } } });
console.log(`\nSegundo factor quitado a ${correo}. Al entrar de nuevo con su contraseña tendrá que activarlo otra vez.\n`);
await db.$disconnect();
