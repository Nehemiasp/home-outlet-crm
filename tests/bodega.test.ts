import "dotenv/config";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { cambiarPermisoPagos, cambiarRol } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { avanzarDespacho, cargarHoja, ESTADOS_DESPACHO, listarDespacho } from "@/lib/pedidos/despacho";
import { esBodega, inicioDe, puedeAjustarExistencias, puedeDespachar, puedeGestionarProductos, puedeUnirContactos, puedeVerAjustes, puedeVerReportes, puedeVerificarPagos, veTodo, type Actor, type Rol } from "@/lib/permisos";
import { puedeVerArchivo } from "@/lib/visibilidad";
import { aislar, crearUsuario, limpiar, PREFIJO, restaurar } from "./apoyo-equipo";

// Necesita la base de datos (npm run db). El rol de bodega: solo catálogo (para mirar) y despacho, sin dinero ni conversaciones.

const act = (rol: Rol): Actor => ({ id: "u1", rol });

describe("permisos de bodega (funciones puras)", () => {
  test("bodega no ve nada de lo operativo: ni conversaciones, ni reportes, ni ajustes, ni pagos", () => {
    const u = act("bodega");
    assert.equal(esBodega(u), true);
    assert.equal(veTodo(u), false); // el error que se evita: «todo el que no es agente ve todo»
    assert.equal(puedeVerAjustes(u), false);
    assert.equal(puedeVerReportes(u), false);
    assert.equal(puedeGestionarProductos(u), false);
    assert.equal(puedeUnirContactos(u), false);
    assert.equal(puedeVerificarPagos(u), false);
    assert.equal(puedeVerificarPagos({ ...u, puedeVerificarPagos: true }), false); // ni con el permiso de un asesor
    assert.equal(puedeAjustarExistencias(u), false);
  });

  test("bodega despacha, y empieza en el despacho", () => {
    assert.equal(puedeDespachar(act("bodega")), true);
    assert.equal(inicioDe(act("bodega")), "/despacho");
    for (const r of ["admin", "jefe_tienda", "agente"] as const) assert.equal(inicioDe(act(r)), "/bandeja", r);
  });

  test("el administrador y el jefe de tienda también ven el despacho; el agente no; y todos menos bodega ajustan existencias", () => {
    assert.equal(puedeDespachar(act("admin")), true);
    assert.equal(puedeDespachar(act("jefe_tienda")), true);
    assert.equal(puedeDespachar(act("agente")), false);
    for (const r of ["admin", "jefe_tienda", "agente"] as const) assert.equal(puedeAjustarExistencias(act(r)), true, r);
  });
});

// Guardia contra olvidos: bodega queda fuera por defecto; solo estos archivos lo admiten a propósito.
describe("bodega solo entra por donde se le abrió", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const ruta = path.join(dir, n);
      if (statSync(ruta).isDirectory()) return n === "node_modules" || n === ".next" ? [] : archivos(ruta);
      return /\.(ts|tsx)$/.test(n) ? [ruta] : [];
    });
  const fuentes = ["app", "lib", "components"].flatMap((d) => archivos(d)).map((f) => f.split(path.sep).join("/"));

  test("solo estos archivos usan requireConBodega (el marco, el catálogo, el despacho, la hoja de bodega y el latido)", () => {
    const usos = fuentes.filter((f) => /requireConBodega\(/.test(readFileSync(f, "utf8")));
    assert.deepEqual(usos.sort(), [
      "app/(app)/catalogo/actions.ts",
      "app/(app)/catalogo/page.tsx",
      "app/(app)/despacho/actions.ts",
      "app/(app)/despacho/page.tsx",
      "app/(app)/equipo/actions.ts",
      "app/(app)/layout.tsx",
      "app/(app)/pedidos/[id]/bodega/page.tsx",
      "lib/session.ts",
    ]);
  });

  test("lo que bodega puede leer del catálogo no incluye acciones de escribir", () => {
    const trozos = readFileSync("app/(app)/catalogo/actions.ts", "utf8").split(/^export async function /m).slice(1); // una acción por trozo
    const abiertas = trozos.filter((t) => t.includes("requireConBodega()")).map((t) => t.slice(0, t.indexOf("(")));
    assert.deepEqual(abiertas.sort(), ["listar", "opciones"]); // listar y las opciones de los filtros: nada más
  });
});

describe("despacho de bodega (con base de datos)", () => {
  let bodega: { id: string; nombre: string; rol: "bodega" };
  let pagado: string, pendiente: string, enviadoYa: string, conChat: string;
  let contactoId: string;
  const BODEGA_ACTOR = () => bodega;

  const crearPedido = async (codigo: string, estado: "pagado" | "pendiente_pago" | "enviado", extra: { entrega?: "envio" | "recoger"; archivoUrl?: string } = {}) =>
    (
      await db.order.create({
        data: {
          codigo, contactoId, canal: "simulado", estado, entrega: extra.entrega ?? "envio", direccion: "Calle 1, zona 2", departamento: "Izabal", municipio: "Morales",
          subtotal: 20_000, total: 22_500, costoEnvio: 2_500, metodoPago: "transferencia", notas: "Frágil",
          lineas: { create: [{ sku: "PRUEBA-EQ-1", nombre: "PRUEBA-EQ Producto", precio: 10_000, cantidad: 2 }] },
        },
      })
    ).id;

  before(async () => {
    await aislar();
    const u = await crearUsuario("bodega1", "bodega");
    bodega = { id: u.id, nombre: u.nombre, rol: "bodega" };
    contactoId = (await db.contact.create({ data: { nombre: `${PREFIJO} cliente bodega`, telefono: "+50255559901" } })).id;
    pagado = await crearPedido("PREQ-000001", "pagado");
    pendiente = await crearPedido("PREQ-000002", "pendiente_pago");
    enviadoYa = await crearPedido("PREQ-000003", "enviado");
    conChat = await crearPedido("PREQ-000004", "pagado", { entrega: "recoger" });
  });
  after(async () => {
    await limpiar();
    await restaurar();
    await db.$disconnect();
  });

  test("la lista solo trae pedidos pagados en despacho, y ningún dato de dinero", async () => {
    const filas = await listarDespacho();
    const mios = filas.filter((f) => f.codigo.startsWith("PREQ-"));
    assert.deepEqual(mios.map((f) => f.codigo).sort(), ["PREQ-000001", "PREQ-000003", "PREQ-000004"]); // el pendiente de pago no aparece
    assert.ok(filas.every((f) => (ESTADOS_DESPACHO as readonly string[]).includes(f.estado)));
    const texto = JSON.stringify(mios);
    for (const campo of ["precio", "total", "subtotal", "costoEnvio", "metodoPago", "pago", "22500", "10000"]) assert.equal(texto.includes(campo), false, `no debe llevar «${campo}»`);
    const uno = mios.find((f) => f.codigo === "PREQ-000001")!;
    assert.equal(uno.lugar, "Morales, Izabal");
    assert.deepEqual([uno.lineas[0]!.cantidad, uno.notas], [2, "Frágil"]);
    assert.deepEqual(uno.pasos, ["preparando"]); // de pagado solo se puede empezar a preparar (no cancelar)
  });

  test("la hoja de bodega: bodega abre las de despacho y no las demás", async () => {
    assert.equal((await cargarHoja(pagado, bodega))?.codigo, "PREQ-000001");
    assert.equal(await cargarHoja(pendiente, bodega), null); // ese pedido aún no se paga
    assert.equal(await cargarHoja("no-existe", bodega), null);
    assert.equal((await cargarHoja(pendiente, { id: "x", rol: "admin" }))?.codigo, "PREQ-000002"); // quien ya veía todo, sigue viéndolo
    assert.equal(await cargarHoja(pagado, { id: "x", rol: "agente" }), null); // un asesor con la visibilidad limitada no abre pedidos ajenos
  });

  test("bodega avanza el pedido paso a paso, sin saltarse ni cancelar", async () => {
    const png = new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)])], "guia.png", { type: "image/png" });
    const envio = (guia: string) => ({ paqueteria: "Forza", guia, archivo: png });
    assert.equal((await avanzarDespacho(pagado, "cancelado", BODEGA_ACTOR())).ok, false);
    assert.equal((await avanzarDespacho(pagado, "pendiente_pago", BODEGA_ACTOR())).ok, false);
    assert.equal((await avanzarDespacho(pagado, "enviado", BODEGA_ACTOR(), envio("G-1"))).ok, false); // falta preparar
    assert.equal((await avanzarDespacho(pendiente, "preparando", BODEGA_ACTOR())).ok, false); // no está pagado
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: pendiente } })).estado, "pendiente_pago");

    assert.equal((await avanzarDespacho(pagado, "preparando", BODEGA_ACTOR())).ok, true);
    assert.equal((await avanzarDespacho(pagado, "enviado", BODEGA_ACTOR())).ok, false); // sin decir cómo sale
    assert.equal((await avanzarDespacho(pagado, "enviado", BODEGA_ACTOR(), envio("  "))).ok, false); // por paquetería exige el número de guía
    assert.equal((await avanzarDespacho(pagado, "enviado", BODEGA_ACTOR(), { ...envio("G-1"), paqueteria: "Mensajería inventada" })).ok, false); // solo las de Ajustes
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: pagado } })).estado, "preparando");
    const enviado = await avanzarDespacho(pagado, "enviado", BODEGA_ACTOR(), envio("GUIA-77"));
    assert.ok(enviado.ok && enviado.guia?.estado === "manual"); // bodega sube la guía; sin conversación, se manda a mano
    const o = await db.order.findUniqueOrThrow({ where: { id: pagado } });
    assert.deepEqual([o.estado, o.guia, o.paqueteria], ["enviado", "GUIA-77", "Forza"]);
    assert.equal((await db.orderEvent.count({ where: { pedidoId: pagado, usuarioId: bodega.id } })) >= 2, true); // queda quién lo hizo
    const nombre = o.guiaArchivoUrl!.replace("/api/archivos/", "");
    assert.equal(await puedeVerArchivo(bodega, nombre), true); // bodega abre la guía de un pedido en despacho
    assert.equal((await listarDespacho()).find((f) => f.id === pagado)?.guiaArchivo?.nombre, "guia.png");
    const asesor = await crearUsuario("asesor-guia", "agente");
    assert.equal(await puedeVerArchivo({ id: asesor.id, rol: "agente" }, nombre), false); // un asesor no abre la guía de un pedido ajeno
    assert.equal((await avanzarDespacho(pagado, "entregado", BODEGA_ACTOR())).ok, true);
    await unlink(path.join(process.cwd(), "uploads", nombre)).catch(() => {});

    assert.equal((await avanzarDespacho(conChat, "preparando", BODEGA_ACTOR())).ok, true);
    assert.equal((await avanzarDespacho(conChat, "listo_para_recoger", BODEGA_ACTOR())).ok, true);
    assert.equal((await avanzarDespacho(enviadoYa, "cancelado", BODEGA_ACTOR())).ok, false);
  });

  test("bodega solo abre las fotos del catálogo, nunca las del chat ni los comprobantes", async () => {
    const foto = `/api/archivos/prueba-eq-${Date.now()}.png`;
    const p = await db.product.create({ data: { sku: "PRUEBA-EQ-BODEGA", nombre: `${PREFIJO} producto con foto`, precio: 100, imagenes: [foto] } });
    try {
      assert.equal(await puedeVerArchivo(bodega, foto.replace("/api/archivos/", "")), true);
      assert.equal(await puedeVerArchivo(bodega, "no-es-del-catalogo.png"), false);
    } finally {
      await db.product.delete({ where: { id: p.id } });
    }
  });

  test("pasar a alguien a bodega le quita las conversaciones y el permiso de verificar pagos, y a bodega no se le da", async () => {
    const admin = { id: (await crearUsuario("badmin", "admin")).id, nombre: `${PREFIJO} badmin` };
    const asesor = await crearUsuario("basesor");
    await db.user.update({ where: { id: asesor.id }, data: { puedeVerificarPagos: true } });
    const conv = await db.conversation.create({ data: { contactoId, canal: "simulado", asignadaAId: asesor.id } });
    assert.deepEqual(await cambiarRol(asesor.id, "bodega", admin), { ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { id: asesor.id } });
    assert.deepEqual([u.rol, u.puedeVerificarPagos], ["bodega", false]);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).asignadaAId, null);
    const r = await cambiarPermisoPagos(asesor.id, true, admin);
    assert.equal(r.ok, false);
  });
});
