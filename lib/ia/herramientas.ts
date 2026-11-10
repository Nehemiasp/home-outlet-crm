import { z } from "zod";
import { obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { departamentoDe, municipioOficial } from "@/lib/guatemala";
import { estaAbierto } from "@/lib/horario";
import { enviarProductoConFotos } from "@/lib/mensajeria";
import { DESCONTADOS, ETIQUETA_ESTADO } from "@/lib/pedidos/estados";
import { estadoDePago, saldoDe } from "@/lib/pedidos/totales";
import { textoCuentas } from "@/lib/plantillas";
import { formatQ } from "@/lib/utils";
import { buscarConocimiento } from "./conocimiento";
import { normalizar, palabras } from "./texto";
import type { ToolDefinition } from "./tipos";

/* ── Definiciones: lo que el asistente puede hacer. No sabe nada del negocio por sí mismo. ── */
const esquemas = {
  buscar_productos: z.object({ texto: z.string().trim().min(1).max(100), categoria: z.string().trim().max(60).optional() }),
  ver_producto: z.object({ id: z.string().min(1).max(40) }),
  datos_negocio: z.object({}),
  buscar_respuesta: z.object({ pregunta: z.string().trim().min(1).max(200) }),
  enviar_producto: z.object({ id: z.string().min(1).max(40), todas_las_fotos: z.boolean().optional() }),
  guardar_dato_cliente: z.object({ campo: z.enum(["nombre", "municipio"]), valor: z.string().trim().min(1).max(80) }),
  pasar_a_asesor: z.object({ motivo: z.string().trim().min(1).max(120) }),
  estado_pedido: z.object({ codigo: z.string().trim().max(30).optional() }),
} as const;

export type NombreHerramienta = keyof typeof esquemas;

export const HERRAMIENTAS: ToolDefinition[] = [
  { name: "buscar_productos", description: "Busca hasta 5 productos activos del catálogo por nombre o descripción. Devuelve nombre y precio.", schema: esquemas.buscar_productos },
  { name: "ver_producto", description: "Detalle de un producto: precio, descripción y foto.", schema: esquemas.ver_producto },
  { name: "datos_negocio", description: "Horario, dirección, formas de pago, envíos y garantía de Home Outlet.", schema: esquemas.datos_negocio },
  { name: "buscar_respuesta", description: "Busca en las preguntas frecuentes del negocio (cambios y devoluciones, apartados, instalación, envíos a municipios, etc.).", schema: esquemas.buscar_respuesta },
  { name: "enviar_producto", description: "Manda al cliente la tarjeta del producto con su foto principal y el precio. Con todas_las_fotos: true manda además las demás fotos del producto: úselo solo si el cliente pidió más fotos o ver mejor el producto.", schema: esquemas.enviar_producto },
  { name: "guardar_dato_cliente", description: "Guarda el nombre o el municipio que el cliente acaba de decir. No guarda nada más.", schema: esquemas.guardar_dato_cliente },
  { name: "estado_pedido", description: "Estado de un pedido DEL CLIENTE de esta conversación: estado, si el pago está confirmado, total, saldo, entrega y guía. Sin código devuelve el último pedido abierto. Si el pedido espera pago, incluye las cuentas bancarias. No puede ver pedidos de otras personas.", schema: esquemas.estado_pedido },
  { name: "pasar_a_asesor", description: "Termina la atención del asistente y deja la conversación esperando a una persona. Úsela cuando el cliente quiera comprar, apartar, pagar, pedir descuento, reclamar, o hable con una persona.", schema: esquemas.pasar_a_asesor },
];

/* ── Ejecución ── */
export type ContextoHerramienta = {
  conversacionId: string | null;
  contactoId: string | null;
  /** En la pantalla de prueba, la evaluación y las sugerencias no se escribe nada ni se manda nada. */
  sandbox: boolean;
  aiRunId?: string;
};

export type ResultadoHerramienta = {
  contenido: string; // JSON que lee el asistente
  consultado?: string; // texto para el equipo
  productos?: string[]; // ids consultados
  sinResultado?: boolean; // buscó y no encontró nada
  derivar?: string; // pasar_a_asesor
  mensajesEnviados?: string[]; // ids de mensajes que mandó la herramienta
};

const json = (o: unknown) => JSON.stringify(o);
const falla = (m: string): ResultadoHerramienta => ({ contenido: json({ error: m }), sinResultado: true });

// Sin existencia: Home Outlet no lleva el inventario al día (el dueño retira productos sin avisar y se cuenta cada semana),
// así que el asistente no la recibe y no puede prometerla. Muestra el producto y el precio; la existencia la confirma un asesor.
type FilaProducto = { id: string; nombre: string; sku: string; descripcion: string | null; categoria: string | null; precio: number };

async function productosActivos(): Promise<FilaProducto[]> {
  const ps = await db.product.findMany({ where: { activo: true }, include: { categoria: true }, take: 5000 });
  return ps.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, descripcion: p.descripcion, categoria: p.categoria?.nombre ?? null, precio: p.precio }));
}

export async function buscarProductosPorTexto(texto: string, categoria?: string, max = 5): Promise<FilaProducto[]> {
  const buscadas = palabras(texto);
  if (buscadas.length === 0) return [];
  const todos = (await productosActivos()).filter((p) => !categoria || normalizar(p.categoria ?? "").includes(normalizar(categoria)));
  const minimo = Math.max(1, Math.ceil(buscadas.length / 2));
  const puntuados = todos.map((p) => {
    const heno = normalizar(`${p.nombre} ${p.sku} ${p.categoria ?? ""} ${p.descripcion ?? ""}`);
    const enNombre = normalizar(p.nombre);
    const coinciden = buscadas.filter((b) => heno.includes(b)).length;
    return { p, coinciden, puntos: coinciden * 2 + buscadas.filter((b) => enNombre.includes(b)).length };
  });
  // Si hay productos que coinciden con más palabras, solo se devuelven los mejores: "pantalla para carro" no trae aspiradoras.
  const mejor = Math.max(0, ...puntuados.map((x) => x.coinciden));
  return puntuados
    .filter((x) => x.coinciden >= Math.max(minimo, mejor))
    .sort((a, b) => b.puntos - a.puntos || a.p.nombre.localeCompare(b.p.nombre, "es"))
    .slice(0, max)
    .map((x) => x.p);
}

const vistaPrecio = (p: { precio: number }) => formatQ(p.precio);

export async function ejecutarHerramienta(nombre: string, entrada: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (!(nombre in esquemas)) return falla("Herramienta desconocida.");
  const nom = nombre as NombreHerramienta;
  const a = esquemas[nom].safeParse(entrada ?? {});
  if (!a.success) return falla("Argumentos inválidos.");
  const args = a.data as Record<string, string>;

  switch (nom) {
    case "buscar_productos": {
      const r = await buscarProductosPorTexto(args.texto!, args.categoria);
      return {
        contenido: json(r.map((p) => ({ id: p.id, nombre: p.nombre, precio: vistaPrecio(p) }))),
        consultado: r.length ? `Consultó: ${r.map((p) => p.nombre).join(", ")}` : `Buscó "${args.texto}" y no encontró productos`,
        productos: r.map((p) => p.id),
        sinResultado: r.length === 0,
      };
    }
    case "ver_producto": {
      const p = await db.product.findFirst({ where: { id: args.id, activo: true }, include: { categoria: true } });
      if (!p) return falla("Producto no encontrado.");
      return {
        contenido: json({ id: p.id, nombre: p.nombre, sku: p.sku, categoria: p.categoria?.nombre ?? null, precio: formatQ(p.precio), descripcion: p.descripcion, foto: p.imagenes[0] ?? null }),
        consultado: `Consultó: ${p.nombre}`,
        productos: [p.id],
      };
    }
    case "estado_pedido": {
      if (!ctx.contactoId) return { contenido: json({ pedido: null }), consultado: "Buscó el pedido del cliente y no encontró ninguno" };
      const codigo = args.codigo?.trim();
      const base = { contactoId: ctx.contactoId, estado: { not: "borrador" as const } };
      const incluir = { pagos: { select: { monto: true, estado: true } } };
      // Solo pedidos de este contacto: un código ajeno responde igual que uno que no existe.
      const o = codigo
        ? await db.order.findFirst({ where: { ...base, codigo: { equals: codigo, mode: "insensitive" } }, include: incluir })
        : ((await db.order.findFirst({ where: { ...base, estado: { in: ["pendiente_pago", "en_revision", "pagado", "preparando", "listo_para_recoger", "enviado"] } }, orderBy: { creada: "desc" }, include: incluir })) ??
          (await db.order.findFirst({ where: base, orderBy: { creada: "desc" }, include: incluir })));
      if (!o) return { contenido: json({ pedido: null }), consultado: codigo ? `Buscó el pedido ${codigo} y no es de este cliente` : "Buscó el pedido del cliente y no encontró ninguno" };
      const verificado = o.pagos.filter((p) => p.estado === "verificado").reduce((t, p) => t + p.monto, 0);
      const [zona, cuentas] = await Promise.all([
        o.zona ? db.shippingZone.findFirst({ where: { nombre: o.zona }, select: { tiempo: true } }) : null,
        o.estado === "pendiente_pago" ? db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }] }) : [],
      ]);
      return {
        contenido: json({
          pedido: {
            codigo: o.codigo, estado: o.estado, estado_texto: ETIQUETA_ESTADO[o.estado].toLowerCase(), pago: estadoDePago(o.total, o.pagos),
            // Solo con esto en true se puede decir que el pago está confirmado.
            pago_confirmado: DESCONTADOS.includes(o.estado), total: formatQ(o.total), saldo: formatQ(saldoDe(o.total, verificado)),
            entrega: o.entrega, departamento: o.departamento, municipio: o.municipio, guia: o.guia, tiempo_estimado: zona?.tiempo ?? null,
            ...(cuentas.length ? { cuentas: textoCuentas(cuentas) } : {}),
          },
        }),
        consultado: `Consultó: pedido ${o.codigo}`,
      };
    }
    case "datos_negocio": {
      const n = await obtenerNegocio();
      const vacio = !n.horario && !n.direccion && !n.pagos && !n.envios && !n.garantia;
      return {
        contenido: json({ negocio: n.nombre, horario: n.horario, abierto_ahora: estaAbierto(n.horarioSemanal), direccion: n.direccion, formas_de_pago: n.pagos, envios: n.envios, garantia: n.garantia }),
        consultado: "Consultó: datos del negocio",
        sinResultado: vacio,
      };
    }
    case "buscar_respuesta": {
      const r = await buscarConocimiento(args.pregunta!);
      return { contenido: json(r.map((x) => ({ pregunta: x.pregunta, respuesta: x.respuesta }))), consultado: r.length ? `Consultó: preguntas frecuentes (${r[0]!.pregunta})` : "Buscó en las preguntas frecuentes y no encontró nada", sinResultado: r.length === 0 };
    }
    case "enviar_producto": {
      const p = await db.product.findFirst({ where: { id: args.id, activo: true }, select: { id: true, nombre: true, imagenes: true } });
      if (!p) return falla("Producto no encontrado.");
      const todas = (a.data as { todas_las_fotos?: boolean }).todas_las_fotos === true && p.imagenes.length > 1;
      const consultado = todas ? `Envió la tarjeta de ${p.nombre} y sus ${p.imagenes.length} fotos` : `Envió la tarjeta de ${p.nombre}`;
      if (ctx.sandbox || !ctx.conversacionId) return { contenido: json({ enviado: true, fotos: todas ? p.imagenes.length : Math.min(1, p.imagenes.length), nota: "Simulado en modo de prueba." }), consultado, productos: [p.id] };
      const r = await enviarProductoConFotos({ conversacionId: ctx.conversacionId, productoId: p.id, fotos: todas ? "todas" : undefined, autor: "asistente", aiRunId: ctx.aiRunId });
      if (!r.ok) return falla(r.error);
      return { contenido: json({ enviado: true, fotos: r.mensajesIds?.length ?? 1 }), consultado, productos: [p.id], mensajesEnviados: r.mensajesIds ?? [r.mensajeId] };
    }
    case "guardar_dato_cliente": {
      if (!ctx.sandbox && ctx.contactoId) {
        // Un municipio dicho a mano se guarda con su nombre oficial y su departamento (si el nombre es único en el país).
        // Si el nombre está en dos departamentos, o no existe, se guarda tal cual y sin departamento (un asesor lo completa al armar el pedido).
        const dep = args.campo === "municipio" ? departamentoDe(args.valor) : null;
        const datos = dep ? { municipio: municipioOficial(dep, args.valor) ?? args.valor, departamento: dep } : args.campo === "municipio" ? { municipio: args.valor, departamento: null } : { [args.campo!]: args.valor };
        await db.contact.update({ where: { id: ctx.contactoId }, data: datos });
      }
      return { contenido: json({ guardado: args.campo }), consultado: `Guardó ${args.campo}: ${args.valor}` };
    }
    case "pasar_a_asesor":
      return { contenido: json({ ok: true }), derivar: args.motivo };
  }
}
