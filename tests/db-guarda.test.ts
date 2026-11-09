import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "@/lib/db";

// Durante las pruebas, un borrado o actualización masiva con un filtro `undefined` se detiene (ver lib/db.ts).
// Cada filtro lleva además un id que no existe: si la guarda fallara, igual no se tocaría ninguna fila.
const NINGUNO = "prueba-guarda-no-existe";

test("un deleteMany o updateMany con un filtro undefined se detiene antes de tocar la base", async () => {
  await assert.rejects(db.conversation.deleteMany({ where: { id: NINGUNO, contactoId: undefined } }), /undefined/);
  await assert.rejects(db.order.deleteMany({ where: { AND: [{ id: NINGUNO }, { contactoId: undefined }] } }), /undefined/);
  await assert.rejects(db.message.updateMany({ where: { id: NINGUNO, conversacion: { contactoId: undefined } }, data: { texto: "x" } }), /undefined/);
  // Lo normal sigue funcionando: un filtro completo, y un updateMany sin filtro hecho a propósito.
  assert.equal((await db.conversation.deleteMany({ where: { id: NINGUNO } })).count, 0);
  assert.equal((await db.conversation.deleteMany({ where: { id: { in: [NINGUNO] }, creada: { gte: new Date(0) } } })).count, 0);
});
