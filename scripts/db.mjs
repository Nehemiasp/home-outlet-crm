// Base de datos local para desarrollo: PostgreSQL real, sin instalar nada aparte.
// En producción se usa un PostgreSQL normal con DATABASE_URL.
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const yaCorre = await new Promise((ok) => {
  const c = connect(5433, "127.0.0.1", () => (c.destroy(), ok(true)));
  c.on("error", () => ok(false));
});
if (yaCorre) {
  console.log("PostgreSQL ya está corriendo en el puerto 5433. No hace falta iniciarlo otra vez.");
  process.exit(0);
}

const { default: EmbeddedPostgres } = await import("embedded-postgres"); // se carga después para no avisar de salida si ya corre
const dir = fileURLToPath(new URL("../.pgdata", import.meta.url));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 5433, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"] });

if (!existsSync(dir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("homeoutlet");
} catch {
  // ya existe
}
console.log("PostgreSQL listo en el puerto 5433. Ctrl+C para detenerlo.");

const salir = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
setInterval(() => {}, 1 << 30);
