// Restaura un respaldo hecho con «npm run respaldo».
//   npm run restaurar -- respaldos/2026-11-05_030000 --a postgresql://usuario:clave@host:5432/base --confirmar
//   Agregue --uploads <carpeta> para también extraer los archivos subidos allí (por defecto no los toca).
// Borra y recrea las tablas del destino. Por eso exige --confirmar, y si el destino es la base actual de este proyecto
// (DATABASE_URL) exige además --sobre-la-actual. Lo más seguro es restaurar primero en una base vacía y revisarla.
// Necesita pg_restore (cliente de PostgreSQL; PG_RESTORE si no está en el PATH).
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";

const falla = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

const args = process.argv.slice(2);
const valor = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const carpeta = args.find((a) => !a.startsWith("--") && a !== valor("--a") && a !== valor("--uploads"));
const destino = valor("--a");
if (!carpeta || !destino) falla("Uso: npm run restaurar -- <carpeta del respaldo> --a <DATABASE_URL de destino> --confirmar [--uploads <carpeta>]");

const dump = join(resolve(carpeta), "base.dump");
if (!existsSync(dump)) falla(`No existe ${dump}.`);
if (!args.includes("--confirmar")) falla("Esto borra y recrea las tablas del destino. Repita el comando con --confirmar si está seguro.");
if (destino === process.env.DATABASE_URL && !args.includes("--sobre-la-actual")) falla("El destino es la base actual de este proyecto. Si de verdad quiere reemplazarla, agregue --sobre-la-actual.");

const r = spawnSync(process.env.PG_RESTORE ?? "pg_restore", ["--clean", "--if-exists", "--no-owner", "--exit-on-error", `--dbname=${destino}`, dump], { stdio: "inherit" });
if (r.error || r.status !== 0) falla(r.error ? "No se encontró pg_restore. Instale el cliente de PostgreSQL o indique su ruta en PG_RESTORE." : "pg_restore falló; revise el mensaje de arriba.");

const archivos = join(resolve(carpeta), "uploads.tar.gz");
const aqui = valor("--uploads");
if (aqui && existsSync(archivos)) {
  mkdirSync(aqui, { recursive: true });
  const entrada = openSync(archivos, "r"); // el archivo entra por la entrada estándar y el destino es la carpeta de trabajo: así no hay rutas con «C:\...» que confundan a tar
  const t = spawnSync("tar", ["-xzf", "-", "--strip-components=1"], { stdio: [entrada, "inherit", "inherit"], cwd: resolve(aqui) });
  closeSync(entrada);
  if (t.error || t.status !== 0) falla("La base se restauró, pero no se pudieron extraer los archivos subidos.");
}
console.log("Restauración lista.");
