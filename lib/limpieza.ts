import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Salir de la demostración: deja la base sin datos del negocio (conversaciones, contactos, catálogo, pedidos, pagos,
 * cuentas, zonas de envío, preguntas frecuentes, etiquetas, ajustes, registros…) y conserva a los usuarios. Es lo que se
 * corre una vez, con la base de demostración, antes de cargar los datos reales. Recibe el cliente de la base para poder
 * probarse sobre una base de prueba aparte; nunca toca archivos (eso lo decide el script).
 */

/** Tablas que NO se vacían: los usuarios (nadie se queda sin entrar), el historial de migraciones y los candados. */
export const TABLAS_CONSERVADAS = ["User", "_prisma_migrations", "Candado"];
/** Los usuarios de demostración (los crea la semilla). */
export const esUsuarioDemo = (correo: string) => correo.toLowerCase().endsWith("@homeoutlet.test");

type Cliente = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction" | "user" | "negocio" | "aiSettings" | "ajustesEquipo" | "ajustesPedidos" | "location">;

const comillas = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;

/** Cuántas filas tiene cada tabla que se vaciaría (solo las que tienen datos). */
export async function contarDatos(db: Pick<PrismaClient, "$queryRawUnsafe">): Promise<Record<string, number>> {
  const tablas = ((await db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)) as { tablename: string }[]).map((t) => t.tablename).filter((t) => !TABLAS_CONSERVADAS.includes(t));
  const cuentas: Record<string, number> = {};
  for (const t of tablas) {
    const n = Number(((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM ${comillas(t)}`)) as { n: number }[])[0]?.n ?? 0);
    if (n > 0) cuentas[t] = n;
  }
  return cuentas;
}

export async function limpiarDatosDemo(db: Cliente, o: { quitarUsuariosDemo?: boolean } = {}): Promise<{ borrado: Record<string, number>; usuariosQuitados: string[] }> {
  const borrado = await contarDatos(db);
  const usuariosAntes = await db.user.count();

  if (o.quitarUsuariosDemo) {
    const usuarios = await db.user.findMany({ select: { correo: true, rol: true, activo: true } });
    const quedan = usuarios.filter((u) => !esUsuarioDemo(u.correo));
    if (!quedan.some((u) => u.rol === "admin" && u.activo)) throw new Error("Quitar los usuarios de demostración dejaría al sistema sin ningún administrador. Cree primero el suyo (npm run admin:crear) y vuelva a correr esto.");
  }

  const tablas = ((await db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)) as { tablename: string }[]).map((t) => t.tablename).filter((t) => !TABLAS_CONSERVADAS.includes(t));
  await db.$transaction(async (tx) => {
    // CASCADE alcanza a todo lo que depende de lo vaciado; si por un descuido alcanzara a los usuarios, se deshace todo.
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tablas.map(comillas).join(", ")} RESTART IDENTITY CASCADE`);
    if ((await tx.user.count()) !== usuariosAntes) throw new Error("El vaciado habría borrado usuarios: se canceló y no se cambió nada.");
  });

  const usuariosQuitados: string[] = [];
  if (o.quitarUsuariosDemo) {
    const demo = (await db.user.findMany({ select: { id: true, correo: true } })).filter((u) => esUsuarioDemo(u.correo));
    for (const u of demo) {
      await db.user.delete({ where: { id: u.id } });
      usuariosQuitados.push(u.correo);
    }
  }

  // Las filas de ajustes y las dos ubicaciones que el sistema necesita, en blanco y con sus valores de fábrica (también se crean solas al usarlas).
  await db.negocio.create({ data: { id: "negocio" } });
  await db.aiSettings.create({ data: { id: "ia" } });
  await db.ajustesEquipo.create({ data: { id: "equipo" } });
  const fisica = await db.location.create({ data: { nombre: "Tienda física" } });
  const linea = await db.location.create({ data: { nombre: "Tienda en línea" } });
  await db.ajustesPedidos.create({ data: { id: "pedidos", ubicacionRecogerId: fisica.id, ubicacionEnvioId: linea.id } });

  return { borrado, usuariosQuitados };
}
