// Sale de la demostración: borra los datos de ejemplo y conserva a los usuarios.
//   npm run demo:limpiar                                   → solo muestra qué se borraría (no cambia nada)
//   npm run demo:limpiar -- --confirmar --base <nombre>    → lo borra. <nombre> es el de la base (para no vaciar la equivocada)
//   Opciones: --quitar-usuarios-demo   quita a los usuarios @homeoutlet.test (exige que quede otro administrador)
//             --archivos               borra también las fotos y comprobantes de uploads/ (o UPLOADS_DIR)
// Nunca corre en producción: un servidor de producción empieza vacío (npm run admin:crear) y no debe tener datos de demostración.
import "dotenv/config";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { NOMBRE_VALIDO } from "../lib/almacenamiento";
import { contarDatos, esUsuarioDemo, limpiarDatosDemo } from "../lib/limpieza";

const falla = (m: string): never => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

if (process.env.NODE_ENV === "production") falla("Esto no corre en producción. Un servidor de producción empieza vacío (npm run admin:crear).");
const url = process.env.DATABASE_URL;
if (!url) falla("Falta DATABASE_URL.");
const base = decodeURIComponent(new URL(url!).pathname.slice(1));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const cuentas = await contarDatos(db);
const usuarios = await db.user.findMany({ orderBy: { nombre: "asc" }, select: { nombre: true, correo: true, rol: true, activo: true } });
console.log(`\nBase «${base}»`);
console.log(Object.keys(cuentas).length ? "Se borrarían:" : "No hay datos que borrar.");
for (const [t, n] of Object.entries(cuentas)) console.log(`  ${t.padEnd(26)} ${n}`);
console.log(`Se conservan ${usuarios.length} usuarios:`);
for (const u of usuarios) console.log(`  ${u.nombre} · ${u.correo} · ${u.rol}${u.activo ? "" : " (desactivado)"}${esUsuarioDemo(u.correo) ? " · demostración" : ""}`);

if (!args.includes("--confirmar")) {
  console.log(`\nNo se cambió nada. Para borrar de verdad:\n  npm run demo:limpiar -- --confirmar --base ${base}\n`);
  await db.$disconnect();
  process.exit(0);
}
if (valor("--base") !== base) falla(`Para confirmar, escriba el nombre de la base: --base ${base}`);

const r = await limpiarDatosDemo(db, { quitarUsuariosDemo: args.includes("--quitar-usuarios-demo") }).catch((e: Error) => falla(e.message));
let archivos = 0;
if (args.includes("--archivos")) {
  const carpeta = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(process.cwd(), "uploads");
  for (const n of await readdir(carpeta).catch(() => [] as string[])) if (NOMBRE_VALIDO.test(n)) (await unlink(path.join(carpeta, n)), archivos++);
}
console.log(`\nListo: ${Object.values(r.borrado).reduce((a, b) => a + b, 0)} filas borradas${r.usuariosQuitados.length ? `, ${r.usuariosQuitados.length} usuarios de demostración quitados` : ""}${args.includes("--archivos") ? `, ${archivos} archivos borrados` : ""}.`);
console.log("Siguiente: entre como administrador y siga Ajustes → Primeros pasos.\n");
await db.$disconnect();
