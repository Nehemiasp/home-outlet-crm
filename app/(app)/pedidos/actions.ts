"use server";

import { z } from "zod";
import { guardarComprobanteSubido } from "@/lib/almacenamiento";
import { puedeCancelarPedido, puedeVerificarPagos, veTodo } from "@/lib/permisos";
import { previsualizarAviso } from "@/lib/pedidos/avisos";
import { buscarDuplicados, registrarPago, rechazarPago, verificarPago, type ActorPagos } from "@/lib/pedidos/pagos";
import type { DuplicadoVisible } from "@/lib/visibilidad";
import type { ResultadoAviso } from "@/lib/pedidos/avisos";
import { CANALES } from "@/lib/canales/tipos";
import { cargarPedido, contarPorVerificar, listarPedidos, VISTAS, type ContadoresPedidos, type DetallePedido, type FilaPedido, type FiltrosPedidos } from "@/lib/pedidos/consultas";
import { ESTADOS } from "@/lib/pedidos/estados";
import { listarCotizaciones, type FilaCotizacion } from "@/lib/pedidos/cotizaciones";
import { avanzarPedido, guardarGuia, marcarEnviado, marcarPendienteEnvio } from "@/lib/pedidos/gestion";
import { envioDeFormulario } from "@/lib/pedidos/formulario-envio";
import { vencerReservas } from "@/lib/pedidos/vencimiento";
import { crearEnlaceDePago, tarjetaActiva } from "@/lib/pagos-tarjeta/cobros";
import { cambiarFormaDePago } from "@/lib/pedidos/pedidos";
import { obtenerAjustesPedidos } from "@/lib/pedidos/ajustes";
import { compatibleConEntrega, METODOS } from "@/lib/pedidos/metodos";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/session";
import { puedeVerMensaje, puedeVerPago, puedeVerPedido, redactarDuplicados } from "@/lib/visibilidad";

const id = z.string().min(1).max(40);
type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });
// Lo que la persona no puede ver responde igual que lo que no existe.
const NO_EXISTE = fallo("El pedido no existe.");

async function actor(): Promise<ActorPagos> {
  const u = await requireUsuario();
  return { id: u.id, nombre: u.nombre, rol: u.rol, puedeVerificarPagos: u.puedeVerificarPagos };
}

const entradaPago = z.object({
  pedidoId: id,
  tipo: z.string().max(30),
  banco: z.string().max(100),
  referencia: z.string().max(100),
  monto: z.string().max(20),
  fecha: z.string().max(10),
  mensajeId: id.nullish(),
});
type EntradaPagoForm = z.input<typeof entradaPago>;

type PagoRegistrado = { ok: true; pagoId: string; duplicados: DuplicadoVisible[]; aviso: ResultadoAviso };

/** Desde la burbuja de una imagen del cliente en la conversación. */
export async function registrarComprobante(entrada: EntradaPagoForm): Promise<PagoRegistrado | Fallo> {
  const a = await actor();
  const p = entradaPago.safeParse(entrada);
  if (!p.success) return fallo("Revise los datos del comprobante.");
  if (!p.data.mensajeId) return fallo("Elija la imagen del comprobante.");
  if (!(await puedeVerPedido(a, p.data.pedidoId)) || !(await puedeVerMensaje(a, p.data.mensajeId))) return NO_EXISTE;
  const r = await registrarPago(p.data, a);
  return r.ok ? { ...r, duplicados: await redactarDuplicados(a, r.duplicados) } : r;
}

/** Desde el detalle del pedido: sube el archivo del comprobante y lo registra. */
export async function subirComprobante(datos: FormData): Promise<PagoRegistrado | Fallo> {
  const a = await actor();
  const p = entradaPago.safeParse(Object.fromEntries([...datos.entries()].filter(([k]) => k !== "archivo")));
  if (!p.success) return fallo("Revise los datos del comprobante.");
  if (!(await puedeVerPedido(a, p.data.pedidoId))) return NO_EXISTE;
  const img = await guardarComprobanteSubido(datos.get("archivo")); // foto o PDF (el comprobante de Paggo suele ser PDF)
  if (!img.ok) return img;
  const r = await registrarPago({ ...p.data, mensajeId: null, archivoUrl: img.url }, a);
  return r.ok ? { ...r, duplicados: await redactarDuplicados(a, r.duplicados) } : r;
}

export async function verificar(pagoId: string) {
  const a = await actor();
  if (!(await puedeVerPago(a, id.parse(pagoId)))) return NO_EXISTE;
  return verificarPago(id.parse(pagoId), a);
}

export async function rechazar(pagoId: string, motivo: string, mensaje: string) {
  const a = await actor();
  if (!(await puedeVerPago(a, id.parse(pagoId)))) return NO_EXISTE;
  return rechazarPago(id.parse(pagoId), z.string().max(400).parse(motivo), a, z.string().max(2000).parse(mensaje) || undefined);
}

/** El texto que recibirá el cliente al rechazar, para que la persona lo revise antes de enviarlo. */
export async function previsualizarRechazo(pedidoId: string, motivo: string): Promise<{ activo: boolean; texto: string }> {
  const u = await requireUsuario();
  if (!(await puedeVerPedido(u, id.parse(pedidoId)))) return { activo: false, texto: "" };
  return previsualizarAviso(id.parse(pedidoId), "pago_rechazado", { motivo: z.string().max(400).parse(motivo).trim() || "…" });
}

export async function duplicadosDe(banco: string, referencia: string, pagoId?: string): Promise<DuplicadoVisible[]> {
  const u = await requireUsuario();
  return redactarDuplicados(u, await buscarDuplicados(z.string().max(100).parse(banco), z.string().max(100).parse(referencia), pagoId ? id.parse(pagoId) : undefined));
}

/** Cuántos pagos esperan verificación: solo para quien puede verificar. */
export async function pagosPorVerificar(): Promise<number> {
  const a = await actor();
  return puedeVerificarPagos(a) ? contarPorVerificar(a) : 0;
}

/* ── Lista y detalle ── */
const filtros = z.object({
  q: z.string().max(100),
  vista: z.enum(VISTAS),
  canal: z.enum(["todos", ...CANALES]),
  asesor: z.string().max(40),
  entrega: z.enum(["todas", "recoger", "envio"]),
  desde: z.string().max(10),
  hasta: z.string().max(10),
  limite: z.number().int().min(1).max(300),
});

export async function listar(f: FiltrosPedidos): Promise<{ items: FilaPedido[]; hayMas: boolean; contadores: ContadoresPedidos }> {
  const u = await requireUsuario();
  await vencerReservas();
  return listarPedidos(filtros.parse(f), u);
}

/** La pestaña «Cotizaciones»: no lleva los filtros de pedidos, solo la búsqueda. */
export async function listarCotizacionesDePedidos(f: { q: string; limite: number }): Promise<{ items: FilaCotizacion[]; hayMas: boolean }> {
  const u = await requireUsuario();
  return listarCotizaciones(z.object({ q: z.string().max(100), limite: z.number().int().min(1).max(500) }).parse(f), u);
}

export type PedidoConPermisos ={ pedido: DetallePedido; puedeVerificar: boolean; puedeCancelar: boolean; sinLimites: boolean; metodos: { id: string; nombre: string }[]; bancos: string[]; tarjeta: boolean; formasPago: { id: string; nombre: string }[]; paqueterias: string[] };

export async function obtener(pedidoId: string): Promise<PedidoConPermisos | null> {
  const a = await actor();
  await vencerReservas();
  const pedido = await cargarPedido(id.parse(pedidoId), a);
  if (!pedido) return null;
  const [aj, cuentas] = await Promise.all([obtenerAjustesPedidos(), db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }], select: { banco: true } })]);
  return {
    pedido,
    puedeVerificar: puedeVerificarPagos(a),
    puedeCancelar: puedeCancelarPedido(a, { creadoPorId: pedido.creadoPor?.id ?? null }, pedido.pagos.some((p) => p.estado === "verificado")),
    sinLimites: veTodo(a),
    metodos: METODOS.filter((m) => aj.metodos.includes(m.id)).map((m) => ({ id: m.id, nombre: m.nombre })),
    bancos: [...new Set(cuentas.map((c) => c.banco))],
    tarjeta: await tarjetaActiva(),
    paqueterias: aj.paqueterias,
    // a qué formas de pago se puede cambiar: las activas que sirven para esa entrega (a tarjeta, pegando el enlace de pago)
    formasPago: METODOS.filter((m) => m.disponible && aj.metodos.includes(m.id) && compatibleConEntrega(m.id, pedido.entrega)).map((m) => ({ id: m.id, nombre: m.nombre })),
  };
}

/** Le manda al cliente el enlace de pago con tarjeta que pegó la persona (Paggo); vacío = reenviar el abierto. Quien ve el pedido puede mandarlo. */
export async function enviarEnlaceTarjeta(pedidoId: string, enlace: string) {
  const a = await actor();
  if (!(await puedeVerPedido(a, id.parse(pedidoId)))) return NO_EXISTE;
  return crearEnlaceDePago(id.parse(pedidoId), a, z.string().max(600).parse(enlace));
}

export async function avanzar(pedidoId: string, a: string, sobrePedido: boolean) {
  const quien = await actor();
  if (!(await puedeVerPedido(quien, id.parse(pedidoId)))) return NO_EXISTE;
  return avanzarPedido(id.parse(pedidoId), z.enum(ESTADOS).parse(a), quien, { sobrePedido });
}

/** «Pendiente de envío»: por dónde sale el pedido. `paqueteria` vacía = entrega propia. */
export async function pasarAPendienteEnvio(pedidoId: string, paqueteria: string) {
  const quien = await actor();
  if (!(await puedeVerPedido(quien, id.parse(pedidoId)))) return NO_EXISTE;
  return marcarPendienteEnvio(id.parse(pedidoId), quien, z.string().max(60).parse(paqueteria) || null);
}

/** «Marcar como enviado»: llega como formulario porque trae el archivo de la guía (la paquetería ya está en el pedido). */
export async function marcarComoEnviado(datos: FormData) {
  const quien = await actor();
  const p = envioDeFormulario(datos);
  if (!p) return fallo("Revise los datos del envío.");
  if (!(await puedeVerPedido(quien, p.pedidoId))) return NO_EXISTE;
  return marcarEnviado(p.pedidoId, quien, p.envio);
}

export async function actualizarGuia(pedidoId: string, guia: string) {
  const a = await actor();
  if (!(await puedeVerPedido(a, id.parse(pedidoId)))) return NO_EXISTE;
  return guardarGuia(id.parse(pedidoId), z.string().max(100).parse(guia), a);
}

/** El cliente cambió de idea con el pedido ya enviado: se cambia la forma de pago y se le manda el resumen nuevo. */
export async function cambiarFormaPago(pedidoId: string, metodo: string, enlacePago = "") {
  const a = await actor();
  if (!(await puedeVerPedido(a, id.parse(pedidoId)))) return NO_EXISTE;
  const m = z.enum(["transferencia", "deposito", "efectivo_en_tienda", "tarjeta", "contra_entrega"]).safeParse(metodo);
  if (!m.success) return fallo("Esa forma de pago no es válida.");
  return cambiarFormaDePago(id.parse(pedidoId), m.data, a, z.string().max(600).parse(enlacePago) || null);
}
