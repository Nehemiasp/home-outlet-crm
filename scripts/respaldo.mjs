// Respaldo de la base de datos y de los archivos subidos (fotos, imágenes de la bandeja y comprobantes de pago).
//   npm run respaldo                  → respaldos/AAAA-MM-DD_HHMMSS/{base.dump, uploads.tar.gz}
//   RESPALDOS_CONSERVAR=14            → cuántos respaldos guardar (los más viejos se borran)
//   RESPALDOS_CARPETA=/ruta/al/disco  → dónde guardarlos (por defecto ./respaldos; en producción, un disco que no sea el del servidor)
//   UPLOADS_DIR=/ruta/a/uploads       → dónde están los archivos subidos (por defecto ./uploads)
//   PG_DUMP=/ruta/a/pg_dump           → si pg_dump no está en el PATH
// Necesita pg_dump (viene con el cliente de PostgreSQL). Pensado para correr cada día desde un cron del hosting.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const falla = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

const url = process.env.DATABASE_URL;
if (!url) falla("Falta DATABASE_URL.");
const raiz = resolve(process.env.RESPALDOS_CARPETA ?? "respaldos");
const conservar = Math.max(1, Number.parseInt(process.env.RESPALDOS_CONSERVAR ?? "14", 10) || 14);

const ahora = new Date();
const p = (n) => String(n).padStart(2, "0");
const nombre = `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}_${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
const carpeta = join(raiz, nombre);
mkdirSync(carpeta, { recursive: true });

const dump = spawnSync(process.env.PG_DUMP ?? "pg_dump", ["--format=custom", "--no-owner", `--file=${join(carpeta, "base.dump")}`, url], { stdio: ["ignore", "inherit", "inherit"] });
if (dump.error || dump.status !== 0) {
  rmSync(carpeta, { recursive: true, force: true });
  falla(dump.error ? "No se encontró pg_dump. Instale el cliente de PostgreSQL o indique su ruta en PG_DUMP." : "pg_dump falló; no se guardó el respaldo.");
}

const uploads = resolve(process.env.UPLOADS_DIR ?? "uploads");
if (existsSync(uploads)) {
  // El archivo va por la salida estándar y la carpeta por nombre, desde su carpeta madre: los distintos tar (el de Git para Windows, el de Windows, el de Linux) se llevan mal con «C:\...».
  const salida = openSync(join(carpeta, "uploads.tar.gz"), "w");
  const tar = spawnSync("tar", ["-czf", "-", basename(uploads)], { stdio: ["ignore", salida, "inherit"], cwd: dirname(uploads) });
  closeSync(salida);
  if (tar.error || tar.status !== 0) falla("No se pudo comprimir uploads/ (¿está tar disponible?). El respaldo de la base sí se guardó.");
}

// Rotación: se borran los más viejos (los nombres ordenan por fecha).
const todos = readdirSync(raiz).filter((d) => /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(d) && statSync(join(raiz, d)).isDirectory()).sort();
for (const viejo of todos.slice(0, Math.max(0, todos.length - conservar))) rmSync(join(raiz, viejo), { recursive: true, force: true });

const mb = (f) => (existsSync(f) ? (statSync(f).size / 1_048_576).toFixed(1) : "—");
console.log(`Respaldo listo en ${carpeta}\n  base.dump ${mb(join(carpeta, "base.dump"))} MB · uploads.tar.gz ${mb(join(carpeta, "uploads.tar.gz"))} MB · se guardan los últimos ${conservar}`);
