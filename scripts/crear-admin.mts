// Crea el primer administrador de un sistema nuevo (en producción la semilla no corre, así que no habría cómo entrar).
//   npm run admin:crear -- --nombre "Nombre Apellido" --correo persona@empresa.com
// Imprime una contraseña temporal UNA sola vez. Si el correo ya existe, no toca nada. Con el sistema ya en uso, los demás
// usuarios se crean desde Ajustes → Usuarios.
import "dotenv/config";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../lib/db";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const entrada = z.object({ nombre: z.string().trim().min(2).max(80), correo: z.string().trim().toLowerCase().pipe(z.email()) }).safeParse({ nombre: arg("--nombre"), correo: arg("--correo") });
if (!entrada.success) {
  console.error('\n✖ Uso: npm run admin:crear -- --nombre "Nombre Apellido" --correo persona@empresa.com\n');
  process.exit(1);
}
const { nombre, correo } = entrada.data;

if (await db.user.findUnique({ where: { correo } })) {
  console.error(`\n✖ Ya existe un usuario con el correo ${correo}. No se cambió nada.\n`);
  await db.$disconnect();
  process.exit(1);
}
const clave = Array.from({ length: 14 }, () => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(54)]).join("");
await db.user.create({ data: { nombre, correo, rol: "admin", passwordHash: await bcrypt.hash(clave, 10) } });
console.log(`\nAdministrador creado.\n  Correo:     ${correo}\n  Contraseña: ${clave}\n\nGuárdela ahora: no se vuelve a mostrar.\n`);
await db.$disconnect();
