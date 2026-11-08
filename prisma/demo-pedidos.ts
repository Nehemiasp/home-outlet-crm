// Pedidos de demostración coherentes con las conversaciones de demo: aproximadamente 1 de cada 6 conversaciones de compra o
// existencia termina en pedido; casi todos pagados y entregados, algunos vencidos o cancelados, dos con un pago rechazado,
// uno con un posible duplicado y, para hoy, pedidos pendientes de pago y en revisión para que haya pagos por verificar.
import type { Canal, EstadoPedido, PrismaClient } from "../generated/prisma/client";
import { costoEnvio, zonaPara } from "../lib/pedidos/envio";
import { calcularTotales } from "../lib/pedidos/totales";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const COMPROBANTE = "/demo/comprobante-demo.png";

function azar(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Destino = "entregado" | "vencido" | "cancelado" | "pendiente_pago" | "en_revision" | "preparando" | "rechazo_y_entregado" | "duplicado";
type Plan = { conv: { id: string; contactoId: string; canal: Canal }; creada: Date; destino: Destino };

export async function sembrarPedidosDemo(db: PrismaClient, equipo: { id: string; nombre: string }[]) {
  if (await db.order.count()) return;
  const [admin, agente] = [equipo[0]!, equipo[1] ?? equipo[0]!];
  const r = azar(20261103);
  const elegir = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)]!;
  const entre = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const ahora = Date.now();

  const [aj, zonaFilas, cuentas, productos, convs] = await Promise.all([
    db.ajustesPedidos.findUniqueOrThrow({ where: { id: "pedidos" } }),
    db.shippingZone.findMany({ where: { activa: true } }),
    db.bankAccount.findMany({ where: { activa: true } }),
    db.product.findMany({ where: { activo: true }, include: { stock: true } }),
    db.conversation.findMany({ where: { creada: { gte: new Date(ahora - 90 * DIA) } }, orderBy: { creada: "asc" }, select: { id: true, contactoId: true, canal: true, motivo: true, creada: true } }),
  ]);
  const zonas = zonaFilas.map((z) => ({ id: z.id, nombre: z.nombre, departamentos: z.departamentos, municipios: z.municipios, costo: z.costo, tiempo: z.tiempo, activa: z.activa }));
  const bancos = [...new Set([...cuentas.map((c) => c.banco), "Banco G&T"])];
  // Lugares de entrega de la demostración: sobre todo Izabal, con algo del resto del país.
  const lugares = [["Izabal", "Puerto Barrios"], ["Izabal", "Puerto Barrios"], ["Izabal", "Morales"], ["Izabal", "Morales"], ["Izabal", "Los Amates"], ["Izabal", "Livingston"], ["Guatemala", "Mixco"], ["Guatemala", "Villa Nueva"], ["Zacapa", "Zacapa"], ["Petén", "Flores"]] as const;

  /* ── Quién tiene pedido ── */
  const planes: Plan[] = [];
  const d = (c: (typeof convs)[number]) => ({ id: c.id, contactoId: c.contactoId, canal: c.canal });
  const recientes = convs.filter((c) => c.creada.getTime() > ahora - 2 * DIA).slice(-7);
  const destinosHoy: Destino[] = ["pendiente_pago", "pendiente_pago", "en_revision", "en_revision", "en_revision", "duplicado", "pendiente_pago"];
  recientes.forEach((c, i) => planes.push({ conv: d(c), creada: new Date(Math.max(c.creada.getTime() + 20 * MIN, ahora - entre(1, 5) * HORA)), destino: destinosHoy[i % destinosHoy.length]! }));
  // Uno ya pagado y en preparación: de una conversación de ayer, para que alcance el tiempo de pagarlo.
  const ayer = convs.filter((c) => c.creada.getTime() < ahora - 10 * HORA && c.creada.getTime() > ahora - 2 * DIA && !recientes.some((x) => x.id === c.id)).at(-1);
  if (ayer) planes.push({ conv: d(ayer), creada: new Date(ayer.creada.getTime() + 20 * MIN), destino: "preparando" });
  const usadas = new Set([...recientes, ...(ayer ? [ayer] : [])].map((c) => c.id));
  const candidatas = convs.filter((c) => (c.motivo === "compra" || c.motivo === "existencia") && !usadas.has(c.id) && c.creada.getTime() < ahora - 2 * DIA);
  const elegidas = candidatas.filter(() => r() < 1 / 6);
  elegidas.forEach((c, i) => {
    const x = r();
    // Los dos primeros con un pago rechazado antes de pagar bien; el resto, casi todo entregado.
    const destino: Destino = i === 3 || i === 11 ? "rechazo_y_entregado" : x < 0.7 ? "entregado" : x < 0.84 ? "vencido" : x < 0.92 ? "cancelado" : "entregado";
    planes.push({ conv: d(c), creada: new Date(c.creada.getTime() + entre(10, 90) * MIN), destino });
  });
  planes.sort((a, b) => a.creada.getTime() - b.creada.getTime());

  /* ── Existencias disponibles, para que lo apartado de los pedidos abiertos sea coherente ── */
  const libre = new Map<string, number>();
  const ubicacionDe = (entrega: "recoger" | "envio") => (entrega === "recoger" ? aj.ubicacionRecogerId : aj.ubicacionEnvioId);
  for (const p of productos) for (const s of p.stock) libre.set(`${p.id}|${s.ubicacionId}`, Math.max(0, s.cantidad - s.apartado));
  const apartar: { productoId: string; ubicacionId: string; cantidad: number }[] = [];

  const codigoDe = (n: number) => `${aj.prefijo}${String(n).padStart(6, "0")}`;
  const referencias: { banco: string; referencia: string }[] = [];
  let numero = aj.siguienteNumero;

  for (const plan of planes) {
    const abierto = plan.destino === "pendiente_pago" || plan.destino === "en_revision" || plan.destino === "duplicado";
    const entrega: "recoger" | "envio" = r() < 0.6 ? "recoger" : "envio";
    const ubicacionId = ubicacionDe(entrega);
    const creador = r() < 0.7 ? agente : admin;

    // Productos: los de un pedido abierto tienen que tener existencia libre en la ubicación.
    const lineas: { productoId: string; sku: string; nombre: string; precio: number; cantidad: number; ubicacionId: string | null }[] = [];
    const quiero = entre(1, 3);
    for (const p of [...productos].sort(() => r() - 0.5)) {
      if (lineas.length >= quiero) break;
      const cantidad = entre(1, 2);
      const k = `${p.id}|${ubicacionId}`;
      if (abierto && (!ubicacionId || (libre.get(k) ?? 0) < cantidad)) continue;
      if (abierto) {
        libre.set(k, (libre.get(k) ?? 0) - cantidad);
        apartar.push({ productoId: p.id, ubicacionId: ubicacionId!, cantidad });
      }
      lineas.push({ productoId: p.id, sku: p.sku, nombre: p.nombre, precio: p.precio, cantidad, ubicacionId });
    }
    if (lineas.length === 0) continue;

    const subtotal = lineas.reduce((t, l) => t + l.precio * l.cantidad, 0);
    const lugar = entrega === "envio" ? elegir(lugares) : null;
    const departamento = lugar?.[0] ?? null;
    const municipio = lugar?.[1] ?? null;
    const zona = lugar ? zonaPara(zonas, departamento, municipio) : null;
    const descuento = r() < 0.08 ? { tipo: "porcentaje" as const, porcentaje: 5 } : null;
    const t = calcularTotales(lineas, descuento, zona ? costoEnvio(zona, subtotal, aj.envioGratisDesde) : 0);

    const T = plan.creada.getTime();
    const eventos: { aEstado: EstadoPedido; deEstado: EstadoPedido | null; fecha: Date; usuarioId?: string; origen?: string; nota?: string }[] = [
      { deEstado: null, aEstado: "borrador", fecha: new Date(T), usuarioId: creador.id, nota: "Pedido creado" },
      { deEstado: "borrador", aEstado: "pendiente_pago", fecha: new Date(T + 4 * MIN), usuarioId: creador.id, nota: "Resumen enviado al cliente" },
    ];
    const pagos: { estado: "en_revision" | "verificado" | "rechazado"; creado: Date; verificadoEn?: Date; motivoRechazo?: string; referencia: string; banco: string; tipo: "transferencia" | "deposito" }[] = [];
    const nuevoPago = (creado: Date, estado: "en_revision" | "verificado" | "rechazado", extra: { verificadoEn?: Date; motivoRechazo?: string; igualA?: { banco: string; referencia: string } } = {}) => {
      const p = { estado, creado, ...extra, tipo: r() < 0.55 ? ("transferencia" as const) : ("deposito" as const), banco: extra.igualA?.banco ?? elegir(bancos), referencia: extra.igualA?.referencia ?? String(entre(1_000_000, 9_999_999)) };
      pagos.push(p);
      return p;
    };

    let estado: EstadoPedido = "pendiente_pago";
    let guia: string | null = null;
    let reservadoHasta: Date | null = new Date(T + 4 * MIN + aj.horasReserva * HORA);
    const pagoEn = (min: number) => new Date(T + 4 * MIN + min * MIN);
    const registrar = (min: number) => {
      eventos.push({ deEstado: "pendiente_pago", aEstado: "en_revision", fecha: pagoEn(min), usuarioId: agente.id, nota: "Comprobante registrado" });
    };

    switch (plan.destino) {
      case "vencido":
        estado = "vencido";
        reservadoHasta = null;
        eventos.push({ deEstado: "pendiente_pago", aEstado: "vencido", fecha: new Date(T + 4 * MIN + aj.horasReserva * HORA), origen: "sistema", nota: "La reserva terminó sin recibir el pago" });
        break;
      case "cancelado":
        estado = "cancelado";
        reservadoHasta = null;
        eventos.push({ deEstado: "pendiente_pago", aEstado: "cancelado", fecha: new Date(T + entre(1, 20) * HORA), usuarioId: creador.id });
        break;
      case "pendiente_pago":
        break;
      case "en_revision":
      case "duplicado": {
        const minutos = entre(10, 90);
        registrar(minutos);
        const previo = plan.destino === "duplicado" ? referencias.at(-1) : undefined; // misma boleta que un pedido anterior
        nuevoPago(pagoEn(minutos), "en_revision", { igualA: previo });
        estado = "en_revision";
        break;
      }
      default: {
        // Con pago verificado: entregado, preparando o pagado con un rechazo antes.
        let min = entre(10, 120);
        registrar(min);
        if (plan.destino === "rechazo_y_entregado") {
          nuevoPago(pagoEn(min), "rechazado", { verificadoEn: pagoEn(min + entre(10, 60)), motivoRechazo: "La boleta no coincide con el monto" });
          eventos.push({ deEstado: "en_revision", aEstado: "pendiente_pago", fecha: pagoEn(min + 30), usuarioId: admin.id, nota: "Pago rechazado: La boleta no coincide con el monto" });
          min += entre(60, 240);
          registrar(min);
        }
        const verif = min + entre(15, 240); // luego: preparando → listo o enviado → entregado, con los tiempos de una tienda normal
        nuevoPago(pagoEn(min), "verificado", { verificadoEn: pagoEn(verif) });
        eventos.push({ deEstado: "en_revision", aEstado: "pagado", fecha: pagoEn(verif), usuarioId: admin.id, nota: "Pago confirmado" });
        reservadoHasta = null;
        estado = "pagado";
        if (plan.destino === "preparando") {
          eventos.push({ deEstado: "pagado", aEstado: "preparando", fecha: pagoEn(verif + 30), usuarioId: agente.id });
          estado = "preparando";
          break;
        }
        const prep = verif + entre(20, 120);
        eventos.push({ deEstado: "pagado", aEstado: "preparando", fecha: pagoEn(prep), usuarioId: agente.id });
        const sale = prep + entre(60, 360);
        if (entrega === "envio") {
          guia = `GT${entre(100000, 999999)}`;
          eventos.push({ deEstado: "preparando", aEstado: "enviado", fecha: pagoEn(sale), usuarioId: agente.id, nota: `Guía ${guia}` });
          eventos.push({ deEstado: "enviado", aEstado: "entregado", fecha: pagoEn(sale + entre(24, 72) * 60), usuarioId: agente.id });
        } else {
          eventos.push({ deEstado: "preparando", aEstado: "listo_para_recoger", fecha: pagoEn(sale), usuarioId: agente.id });
          eventos.push({ deEstado: "listo_para_recoger", aEstado: "entregado", fecha: pagoEn(sale + entre(60, 2000)), usuarioId: agente.id });
        }
        estado = "entregado";
      }
    }
    // Nada ocurre en el futuro: si una fecha pasaría de ahora, el pedido se queda en el paso anterior.
    const validos = eventos.filter((e) => e.fecha.getTime() <= ahora);
    if (validos.length === 0) continue; // todo ocurriría en el futuro (la conversación es de hace minutos): ese pedido no se crea
    if (validos.length !== eventos.length) {
      estado = validos.at(-1)!.aEstado;
      if (estado !== "pendiente_pago" && estado !== "en_revision") reservadoHasta = null;
      if (estado !== "enviado" && estado !== "entregado") guia = null;
    }
    // Si un pedido que iba a estar más adelantado se quedó esperando pago, también aparta sus unidades.
    if ((estado === "pendiente_pago" || estado === "en_revision") && !abierto) for (const l of lineas) if (l.ubicacionId) apartar.push({ productoId: l.productoId, ubicacionId: l.ubicacionId, cantidad: l.cantidad });
    const pagosValidos = pagos.filter((p) => p.creado.getTime() <= ahora).map((p) => (p.verificadoEn && p.verificadoEn.getTime() > ahora ? { ...p, estado: "en_revision" as const, verificadoEn: undefined } : p));
    for (const p of pagosValidos) if (p.estado === "verificado") referencias.push({ banco: p.banco, referencia: p.referencia });

    await db.order.create({
      data: {
        codigo: codigoDe(numero++), contactoId: plan.conv.contactoId, conversacionId: plan.conv.id, canal: plan.conv.canal, estado, entrega,
        direccion: entrega === "envio" ? "Barrio El Centro, casa azul frente al parque" : null, departamento, municipio, zona: zona?.nombre ?? null, guia,
        subtotal: t.subtotal, descuentoMonto: t.descuentoMonto, descuentoMotivo: t.descuentoMonto > 0 ? "Cliente frecuente" : null, costoEnvio: t.costoEnvio, total: t.total,
        creadoPorId: creador.id, reservadoHasta, creada: plan.creada,
        lineas: { create: lineas },
        eventos: { create: validos.map((e) => ({ deEstado: e.deEstado, aEstado: e.aEstado, fecha: e.fecha, usuarioId: e.usuarioId, origen: e.origen ?? "usuario", nota: e.nota })) },
        pagos: {
          create: pagosValidos.map((p) => ({
            tipo: p.tipo, banco: p.banco, referencia: p.referencia, monto: t.total, fechaPago: p.creado, archivoUrl: COMPROBANTE, estado: p.estado, creado: p.creado,
            registradoPorId: agente.id, verificadoEn: p.verificadoEn ?? null, verificadoPorId: p.verificadoEn ? admin.id : null, motivoRechazo: p.motivoRechazo ?? null,
          })),
        },
      },
    });
  }

  // Lo apartado por los pedidos abiertos y el siguiente número de pedido.
  for (const a of apartar) await db.stock.update({ where: { productoId_ubicacionId: { productoId: a.productoId, ubicacionId: a.ubicacionId } }, data: { apartado: { increment: a.cantidad } } });
  await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { siguienteNumero: numero } });
}
