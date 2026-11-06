import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { cargarConversacion, contarNoLeidos, listarConversaciones } from "@/lib/bandeja";
import type { Filtros } from "@/lib/bandeja-tipos";
import { buscarContactos, cargarContacto, listarContactos } from "@/lib/contactos";
import { db } from "@/lib/db";
import { cargarPedido, contarPorVerificar, contarVistas, listarPedidos, type FiltrosPedidos } from "@/lib/pedidos/consultas";
import { buscarDuplicados } from "@/lib/pedidos/pagos";
import { puedeVerArchivo, puedeVerContacto, puedeVerConversacion, puedeVerMensaje, puedeVerPago, puedeVerPedido, redactarDuplicados, type Actor } from "@/lib/visibilidad";
import { aislar, conversacionEsperando, crearUsuario, fijarAjustes, limpiar, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). Un asesor no puede leer, buscar ni modificar lo de otro asesor por ninguna ruta.

const filtrosConv = (o: Partial<Filtros> = {}): Filtros => ({ tab: "todas", atencion: "todas", estado: "todos", canal: "todos", asesor: "todos", q: "", limite: 50, ...o });
const filtrosPed = (o: Partial<FiltrosPedidos> = {}): FiltrosPedidos => ({ q: "", vista: "todos", canal: "todos", asesor: "todos", entrega: "todas", desde: "", hasta: "", limite: 50, ...o });
const filtrosCon = (o = {}) => ({ q: "", etiquetaId: "", canal: "todos" as const, asesor: "todos", orden: { clave: "nombre" as const, dir: "asc" as const }, pagina: 1, ...o });

describe("visibilidad por asesor (con base de datos)", () => {
  let A: Actor, B: Actor, ADMIN: Actor;
  // Datos: la conversación de A, la de B, una sin asignar, un contacto que creó A, y pedidos con comprobante en cada una.
  let a: Awaited<ReturnType<typeof conversacionEsperando>>, b: typeof a, libre: typeof a;
  let contactoDeA: string;
  let pedidoA: string, pedidoB: string, pedidoHuerfano: string;
  let mensajeA: string, mensajeB: string, pagoA: string, pagoB: string;
  const archivoA = `/api/archivos/${"a".repeat(8)}-prueba-eq-a.png`;
  const archivoB = `/api/archivos/${"b".repeat(8)}-prueba-eq-b.png`;
  const pedido = (contactoId: string, conversacionId: string | null, n: number) =>
    db.order.create({ data: { codigo: `PRUEBA-EQ-V${n}-${Date.now()}`, contactoId, conversacionId, canal: "simulado", estado: "en_revision", total: 1000 } });

  before(async () => {
    await aislar();
    A = { id: (await crearUsuario("va")).id, rol: "agente" };
    B = { id: (await crearUsuario("vb")).id, rol: "agente" };
    ADMIN = { id: (await crearUsuario("vadmin", "admin")).id, rol: "admin" };

    a = await conversacionEsperando({ asignadaAId: A.id });
    b = await conversacionEsperando({ asignadaAId: B.id });
    libre = await conversacionEsperando();
    contactoDeA = (await db.contact.create({ data: { nombre: "PRUEBA-EQ contacto creado por A", creadoPorId: A.id } })).id;

    // Mensajes con imagen (comprobantes) y textos que se pueden buscar.
    mensajeA = (await db.message.create({ data: { conversacionId: a.conversacion.id, direccion: "entrante", tipo: "image", archivoUrl: archivoA, texto: "secreto-de-a" } })).id;
    mensajeB = (await db.message.create({ data: { conversacionId: b.conversacion.id, direccion: "entrante", tipo: "image", archivoUrl: archivoB, texto: "secreto-de-b" } })).id;
    await db.conversation.updateMany({ where: { id: { in: [a.conversacion.id, b.conversacion.id] } }, data: { noLeidos: 3 } });

    pedidoA = (await pedido(a.contacto.id, a.conversacion.id, 1)).id;
    pedidoB = (await pedido(b.contacto.id, b.conversacion.id, 2)).id;
    pedidoHuerfano = (await pedido(a.contacto.id, null, 3)).id;
    const pago = (pedidoId: string, mensajeId: string | null, archivoUrl: string | null) =>
      db.payment.create({ data: { pedidoId, tipo: "transferencia", banco: "Banco PRUEBA-EQ", referencia: "REF-EQ-1", monto: 1000, fechaPago: new Date(), mensajeId, archivoUrl } });
    pagoA = (await pago(pedidoA, mensajeA, archivoA)).id;
    pagoB = (await pago(pedidoB, mensajeB, archivoB)).id;

    // El contacto de A también tuvo una conversación con B (con un pedido de B): A no debe ver ese rastro.
    const anterior = await db.conversation.create({ data: { contactoId: a.contacto.id, canal: "whatsapp", estado: "cerrada", asignadaAId: B.id } });
    await pedido(a.contacto.id, anterior.id, 4);
  });
  after(async () => {
    await db.payment.deleteMany({ where: { banco: "Banco PRUEBA-EQ" } });
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  describe("bandeja", () => {
    test("un asesor solo lista las conversaciones asignadas a él, pida la pestaña que pida", async () => {
      for (const tab of ["todas", "sin-asignar", "mias"] as const) {
        const ids = (await listarConversaciones(filtrosConv({ tab, q: "PRUEBA-EQ" }), A)).items.map((i) => i.id);
        assert.ok(!ids.includes(b.conversacion.id), `${tab}: la de B`);
        assert.ok(!ids.includes(libre.conversacion.id), `${tab}: la sin asignar`);
      }
      const propias = (await listarConversaciones(filtrosConv({ tab: "mias", q: "PRUEBA-EQ" }), A)).items.map((i) => i.id);
      assert.deepEqual(propias, [a.conversacion.id]);
    });

    test("la búsqueda por nombre, teléfono o texto del mensaje no encuentra lo ajeno", async () => {
      for (const q of [b.contacto.nombre, b.contacto.telefono!, "secreto-de-b"]) {
        assert.equal((await listarConversaciones(filtrosConv({ q }), A)).items.length, 0, q);
      }
      assert.equal((await listarConversaciones(filtrosConv({ q: "secreto-de-a" }), A)).items.length, 1);
    });

    test("el filtro «Asesor» no le sirve a un asesor para ver las de otro", async () => {
      const r = await listarConversaciones(filtrosConv({ asesor: B.id, q: "PRUEBA-EQ" }), A);
      assert.ok(!r.items.some((i) => i.id === b.conversacion.id));
    });

    test("el administrador ve todo y puede filtrar por asesor o por «sin asignar»", async () => {
      const todas = (await listarConversaciones(filtrosConv({ q: "PRUEBA-EQ" }), ADMIN)).items.map((i) => i.id);
      for (const c of [a, b, libre]) assert.ok(todas.includes(c.conversacion.id));
      assert.deepEqual((await listarConversaciones(filtrosConv({ asesor: B.id, estado: "abierta", q: "PRUEBA-EQ" }), ADMIN)).items.map((i) => i.id), [b.conversacion.id]);
      assert.deepEqual((await listarConversaciones(filtrosConv({ asesor: "sin", estado: "abierta", q: "PRUEBA-EQ" }), ADMIN)).items.map((i) => i.id), [libre.conversacion.id]);
    });

    test("abrir la conversación de otro devuelve null; la propia, sin rastro de otros asesores", async () => {
      assert.equal(await cargarConversacion(b.conversacion.id, A), null);
      assert.equal(await cargarConversacion(libre.conversacion.id, A), null);
      const propia = await cargarConversacion(a.conversacion.id, A);
      assert.ok(propia);
      assert.equal(propia.historial.length, 0, "la conversación anterior de B no aparece");
      assert.equal(propia.compras.cantidad, 1, "solo el pedido de su conversación: ni el de B ni el que no tiene conversación");
      assert.equal(propia.usuarios.length, 0, "no recibe la lista del equipo");
    });

    test("los contadores y el sondeo cuentan solo lo suyo", async () => {
      await db.conversation.updateMany({ where: { id: { in: [a.conversacion.id, b.conversacion.id] } }, data: { noLeidos: 3 } }); // abrirlas las marcó como leídas
      assert.equal(await contarNoLeidos(A), 3);
      assert.ok((await contarNoLeidos(ADMIN)) >= 6);
    });
  });

  describe("contactos", () => {
    test("la lista y la búsqueda solo traen contactos ligados a sus conversaciones o creados por él", async () => {
      const lista = (await listarContactos(filtrosCon({ q: "PRUEBA-EQ" }), A)).filas.map((f) => f.id);
      assert.ok(lista.includes(a.contacto.id) && lista.includes(contactoDeA));
      assert.ok(!lista.includes(b.contacto.id) && !lista.includes(libre.contacto.id));
      const busqueda = (await buscarContactos("PRUEBA-EQ", A)).map((c) => c.id);
      assert.ok(!busqueda.includes(b.contacto.id));
      assert.equal((await listarContactos(filtrosCon({ q: b.contacto.telefono! }), A)).total, 0);
    });

    test("abrir el contacto de otro devuelve null; el propio no muestra conversaciones ni compras ajenas", async () => {
      assert.equal(await cargarContacto(b.contacto.id, A), null);
      assert.equal(await cargarContacto(libre.contacto.id, A), null);
      const c = await cargarContacto(a.contacto.id, A);
      assert.ok(c);
      assert.deepEqual(c.conversaciones.map((v) => v.id), [a.conversacion.id]);
      assert.equal(c.compras.cantidad, 1);
    });

    test("el administrador filtra por asesor responsable", async () => {
      await db.contact.update({ where: { id: b.contacto.id }, data: { asesorResponsableId: B.id } });
      const r = (await listarContactos(filtrosCon({ q: "PRUEBA-EQ", asesor: B.id }), ADMIN)).filas.map((f) => f.id);
      assert.deepEqual(r, [b.contacto.id]);
    });
  });

  describe("pedidos", () => {
    test("la lista y los contadores solo incluyen los pedidos de sus conversaciones", async () => {
      const ids = (await listarPedidos(filtrosPed({ q: "PRUEBA-EQ" }), A)).items.map((i) => i.id);
      assert.ok(ids.includes(pedidoA));
      assert.ok(!ids.includes(pedidoB) && !ids.includes(pedidoHuerfano), "ni el de B ni el que no tiene conversación");
      const admin = (await listarPedidos(filtrosPed({ q: "PRUEBA-EQ" }), ADMIN)).items.map((i) => i.id);
      for (const p of [pedidoA, pedidoB, pedidoHuerfano]) assert.ok(admin.includes(p));
      assert.ok((await contarVistas(A)).porVerificar < (await contarVistas(ADMIN)).porVerificar);
      assert.equal(await contarPorVerificar(A), 1);
    });

    test("abrir el pedido de otro devuelve null", async () => {
      assert.equal(await cargarPedido(pedidoB, A), null);
      assert.equal(await cargarPedido(pedidoHuerfano, A), null);
      assert.ok(await cargarPedido(pedidoA, A));
      assert.ok(await cargarPedido(pedidoB, ADMIN));
    });

    test("el aviso de pago duplicado no dice cuál es el pedido ajeno ni deja abrirlo", async () => {
      const detalle = await cargarPedido(pedidoA, A);
      const dup = detalle!.pagos[0]!.duplicados;
      assert.equal(dup.length, 1);
      assert.deepEqual({ pedidoId: dup[0]!.pedidoId, codigo: dup[0]!.codigo }, { pedidoId: null, codigo: null });
      const visto = await cargarPedido(pedidoA, ADMIN);
      assert.equal(visto!.pagos[0]!.duplicados[0]!.pedidoId, pedidoB);
      const crudo = await buscarDuplicados("Banco PRUEBA-EQ", "REF-EQ-1", pagoA);
      assert.equal((await redactarDuplicados(A, crudo))[0]!.codigo, null);
    });
  });

  describe("comprobaciones que usan las acciones del servidor", () => {
    test("ninguna se puede hacer sobre algo ajeno", async () => {
      assert.equal(await puedeVerConversacion(A, a.conversacion.id), true);
      assert.equal(await puedeVerConversacion(A, b.conversacion.id), false);
      assert.equal(await puedeVerConversacion(A, libre.conversacion.id), false);
      assert.equal(await puedeVerContacto(A, b.contacto.id), false);
      assert.equal(await puedeVerContacto(A, contactoDeA), true);
      assert.equal(await puedeVerPedido(A, pedidoB), false);
      assert.equal(await puedeVerPedido(A, pedidoA), true);
      assert.equal(await puedeVerMensaje(A, mensajeB), false);
      assert.equal(await puedeVerMensaje(A, mensajeA), true);
      assert.equal(await puedeVerPago(A, pagoB), false);
      assert.equal(await puedeVerPago(A, pagoA), true);
      for (const ok of [await puedeVerConversacion(ADMIN, b.conversacion.id), await puedeVerPedido(ADMIN, pedidoB), await puedeVerPago(ADMIN, pagoB)]) assert.equal(ok, true);
    });

    test("los archivos (fotos del chat y comprobantes) solo los abre su dueño", async () => {
      const nombreA = archivoA.split("/").pop()!;
      const nombreB = archivoB.split("/").pop()!;
      assert.equal(await puedeVerArchivo(A, nombreA), true);
      assert.equal(await puedeVerArchivo(A, nombreB), false);
      assert.equal(await puedeVerArchivo(A, "no-existe.png"), false);
      assert.equal(await puedeVerArchivo(ADMIN, nombreB), true);
    });

    test("con «ven solo sus conversaciones» apagado, todo se ve", async () => {
      await fijarAjustes({ asesoresVenSoloSuyas: false });
      assert.equal(await puedeVerConversacion(A, b.conversacion.id), true);
      assert.equal(await puedeVerPedido(A, pedidoB), true);
      assert.ok((await listarConversaciones(filtrosConv({ q: "PRUEBA-EQ" }), A)).items.some((i) => i.id === b.conversacion.id));
      assert.ok(await cargarContacto(b.contacto.id, A));
      await fijarAjustes({ asesoresVenSoloSuyas: true });
    });
  });

  describe("red de seguridad: las acciones del servidor", () => {
    // Toda acción que recibe el id de una conversación, un mensaje, un pedido, un pago o un contacto tiene que comprobar
    // que la persona lo puede ver. Si alguien agrega una acción nueva sin esa comprobación, esta prueba falla.
    const archivos = ["app/(app)/bandeja/actions.ts", "app/(app)/bandeja/pedido-actions.ts", "app/(app)/contactos/actions.ts", "app/(app)/pedidos/actions.ts"];
    const COMPRUEBA = /\b(ve|puedeVer\w+|cargarConversacion|cargarContacto|cargarPedido|listarConversaciones|listarContactos|listarPedidos|buscarContactos|buscar|redactarDuplicados|contarPorVerificar)\(/;
    // Acciones que no necesitan la comprobación, con su motivo.
    const EXENTAS: Record<string, string> = {
      unirContactos: "solo el administrador (puedeUnirContactos)",
      crearContacto: "crea uno nuevo: no hay nada ajeno que comprobar",
    };

    for (const archivo of archivos) {
      test(archivo, () => {
        const texto = readFileSync(archivo, "utf8");
        const acciones = texto.split(/^export async function /m).slice(1);
        assert.ok(acciones.length > 0);
        for (const bloque of acciones) {
          const nombre = /^(\w+)/.exec(bloque)![1]!;
          const parametros = /^\w+\(([^)]*)\)/s.exec(bloque)?.[1] ?? "";
          const recibeId = /\b(conversacionId|mensajeId|pedidoId|pagoId|contactoId|conservarId)\b|EntradaPedido|EntradaPagoForm|FormData|\bf: Filtros|\bf: FiltrosPedidos|\bf: FiltrosContactos/.test(parametros) || /^(pagosPorVerificar|duplicadosDe|buscarContactos)\b/.test(nombre);
          if (!recibeId || nombre in EXENTAS) continue;
          assert.ok(COMPRUEBA.test(bloque), `${archivo}: ${nombre} recibe datos de un cliente, conversación o pedido y no comprueba que la persona lo pueda ver`);
        }
      });
    }

    test("las páginas de detalle usan los cargadores con filtro (404 para lo ajeno)", () => {
      const paginas: [string, RegExp][] = [
        ["app/(app)/bandeja/[id]/page.tsx", /cargarConversacion\(id, usuario\)/],
        ["app/(app)/contactos/[id]/page.tsx", /cargarContacto\(id, usuario\)/],
        ["app/(app)/pedidos/[id]/page.tsx", /obtener\(id\)/],
        ["app/(app)/pedidos/[id]/bodega/page.tsx", /cargarPedido\(id, u\)/],
      ];
      for (const [ruta, patron] of paginas) {
        const t = readFileSync(ruta, "utf8");
        assert.match(t, patron, ruta);
        assert.match(t, /notFound\(\)/, `${ruta} responde 404`);
      }
    });
  });
});
