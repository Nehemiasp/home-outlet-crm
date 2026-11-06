import { db } from "@/lib/db";
import type { StatusUpdate } from "@/lib/canales/tipos";

const orden = { enviando: 0, enviado: 1, entregado: 2, leido: 3 } as const;

/** Aplica un aviso de entrega. Los estados solo avanzan: un "entregado" tardío no baja un "leído". */
export async function aplicarEstado({ externalMessageId, status }: StatusUpdate) {
  const m = await db.message.findUnique({ where: { externalMessageId }, select: { id: true, estado: true } });
  if (!m) return;
  const actual = m.estado && m.estado !== "fallo" ? orden[m.estado] : -1;
  if (status === "fallo" ? actual > orden.enviado : orden[status] <= actual) return;
  await db.message.update({ where: { id: m.id }, data: { estado: status } });
}
