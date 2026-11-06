import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { db } from "@/lib/db";
import { listarContactos, unirContactos } from "@/lib/contactos";

// Necesita la base de datos (npm run db). Todo lo que crea lleva el prefijo PRUEBA y se borra al final.
const P = "PRUEBA-CONTACTOS";
const filtros = { q: "", etiquetaId: "", canal: "todos" as const, asesor: "todos", orden: { clave: "ultimo" as const, dir: "desc" as const }, pagina: 1 };

describe("contactos", () => {
  after(async () => {
    await db.contact.deleteMany({ where: { nombre: { startsWith: P } } });
    await db.tag.deleteMany({ where: { nombre: { startsWith: P } } });
    const actor = await db.user.findUnique({ where: { correo: "contactos-prueba@homeoutlet.test" } });
    if (actor) await db.activityLog.deleteMany({ where: { usuarioId: actor.id } });
    await db.user.deleteMany({ where: { correo: "contactos-prueba@homeoutlet.test" } });
    await db.$disconnect();
  });

  test("unir: todo pasa al contacto que se conserva y el otro desaparece", async () => {
    const actor = await db.user.create({ data: { nombre: "Admin de la prueba", correo: "contactos-prueba@homeoutlet.test", passwordHash: "x", rol: "admin" } });
    const t1 = await db.tag.create({ data: { nombre: `${P} uno`, color: "gris" } });
    const t2 = await db.tag.create({ data: { nombre: `${P} dos`, color: "naranja" } });
    const a = await db.contact.create({ data: { nombre: `${P} A`, notas: "Nota de A", etiquetas: { connect: [{ id: t1.id }] } } });
    const b = await db.contact.create({ data: { nombre: `${P} B`, telefono: "+50255559997", correo: "b@ejemplo.com", notas: "Nota de B", etiquetas: { connect: [{ id: t1.id }, { id: t2.id }] } } });
    await db.channelIdentity.create({ data: { contactoId: a.id, canal: "tiktok", externalContactId: `${P}-tiktok-a` } });
    await db.channelIdentity.create({ data: { contactoId: b.id, canal: "simulado", externalContactId: "+50255559997" } });
    await db.conversation.create({ data: { contactoId: a.id, canal: "tiktok" } });
    await db.conversation.create({ data: { contactoId: b.id, canal: "simulado" } });

    assert.deepEqual(await unirContactos(a.id, a.id, actor), { ok: false, error: "Elija dos contactos distintos." });
    assert.deepEqual(await unirContactos(a.id, b.id, actor), { ok: true });

    const unido = await db.contact.findUniqueOrThrow({ where: { id: a.id }, include: { etiquetas: true, identidades: true, conversaciones: true } });
    assert.equal(unido.telefono, "+50255559997"); // A no tenía teléfono: recibe el de B
    assert.equal(unido.correo, "b@ejemplo.com");
    assert.equal(unido.notas, "Nota de A\n\nNota de B");
    assert.deepEqual(unido.etiquetas.map((t) => t.nombre).sort(), [`${P} dos`, `${P} uno`]); // sin duplicar la que ambos tenían
    assert.equal(unido.identidades.length, 2);
    assert.equal(unido.conversaciones.length, 2);
    assert.equal(await db.contact.findUnique({ where: { id: b.id } }), null);
    assert.equal((await db.activityLog.count({ where: { accion: "unir_contactos", entidadId: a.id } })), 1);

    // Unir con uno que ya no existe falla sin tocar nada
    const r = await unirContactos(a.id, b.id, actor);
    assert.equal(r.ok, false);
  });

  test("listar: busca por nombre y teléfono, filtra por etiqueta y canal, y deja al final a quien no ha escrito", async () => {
    const t = await db.tag.create({ data: { nombre: `${P} filtro`, color: "exito" } });
    const reciente = await db.contact.create({ data: { nombre: `${P} Reciente`, telefono: "+50255559991", etiquetas: { connect: [{ id: t.id }] } } });
    const antiguo = await db.contact.create({ data: { nombre: `${P} Antiguo`, telefono: "+50255559992", etiquetas: { connect: [{ id: t.id }] } } });
    await db.contact.create({ data: { nombre: `${P} Sin mensajes`, telefono: "+50255559993", etiquetas: { connect: [{ id: t.id }] } } });
    await db.channelIdentity.create({ data: { contactoId: reciente.id, canal: "instagram", externalContactId: `${P}-ig-1` } });
    await db.conversation.create({ data: { contactoId: reciente.id, canal: "instagram", lastMessageAt: new Date() } });
    await db.conversation.create({ data: { contactoId: antiguo.id, canal: "facebook", lastMessageAt: new Date(Date.now() - 5 * 86_400_000) } });

    const porEtiqueta = await listarContactos({ ...filtros, etiquetaId: t.id }, { id: "admin", rol: "admin" });
    assert.deepEqual(porEtiqueta.filas.map((f) => f.nombre), [`${P} Reciente`, `${P} Antiguo`, `${P} Sin mensajes`]);

    const porNombreAsc = await listarContactos({ ...filtros, etiquetaId: t.id, orden: { clave: "nombre", dir: "asc" } }, { id: "admin", rol: "admin" });
    assert.deepEqual(porNombreAsc.filas.map((f) => f.nombre), [`${P} Antiguo`, `${P} Reciente`, `${P} Sin mensajes`]);

    const porTelefono = await listarContactos({ ...filtros, q: "5555 9992" }, { id: "admin", rol: "admin" }); // se busca por los dígitos
    assert.deepEqual(porTelefono.filas.map((f) => f.nombre), [`${P} Antiguo`]);

    const porCanal = await listarContactos({ ...filtros, etiquetaId: t.id, canal: "instagram" }, { id: "admin", rol: "admin" });
    assert.deepEqual(porCanal.filas.map((f) => f.nombre), [`${P} Reciente`]);

    const ninguno = await listarContactos({ ...filtros, q: "no-existe-ese-nombre" }, { id: "admin", rol: "admin" });
    assert.equal(ninguno.total, 0);
    assert.equal(ninguno.paginas, 1);
  });
});
