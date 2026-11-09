import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/dinero";
import { log } from "@/lib/ajustes";
import type { ModoInventario, Prisma, TipoCuenta, TipoPago } from "@/generated/prisma/client";
import { CLAVES_MENSAJE, MENSAJES, type ClaveMensaje } from "./mensajes";
import { pasarela } from "@/lib/pagos-tarjeta";
import { metodosSeleccionables } from "./metodos";
import { departamentoOficial, municipioOficial } from "@/lib/guatemala";
import type { Zona } from "./envio";
import { compararTiendas, TIENDA_MIXCO, TIENDA_PUERTO_BARRIOS } from "@/lib/tiendas";

type Actor = { id: string; nombre: string };
type Resultado = { ok: true } | { ok: false; error: string };
const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ── Ajustes generales de pedidos (una fila) ── */

/** La fila de ajustes; si no existe se crea con Puerto Barrios para recoger y Mixco para envíos. */
export async function obtenerAjustesPedidos(c: Prisma.TransactionClient = db) {
  const a = await c.ajustesPedidos.findUnique({ where: { id: "pedidos" } });
  if (a) return a;
  const ubicaciones = await c.location.findMany({ select: { id: true, nombre: true } });
  const por = (n: string) => ubicaciones.find((u) => u.nombre === n)?.id ?? null;
  return c.ajustesPedidos.upsert({ where: { id: "pedidos" }, create: { ubicacionRecogerId: por(TIENDA_PUERTO_BARRIOS.nombre), ubicacionEnvioId: por(TIENDA_MIXCO.nombre) }, update: {} });
}

/** Las tiendas activas con su dirección, Puerto Barrios primero. */
export async function tiendasActivas(c: Prisma.TransactionClient = db) {
  return (await c.location.findMany({ where: { activa: true }, select: { id: true, nombre: true, direccion: true } })).sort(compararTiendas);
}

/** La tienda donde se recoge: la del pedido (o cotización) o, si no tiene una (los de antes), la de Ajustes. */
export async function tiendaDeRecoger(recogerEnId: string | null | undefined) {
  const id = recogerEnId ?? (await obtenerAjustesPedidos()).ubicacionRecogerId;
  return id ? db.location.findUnique({ where: { id }, select: { id: true, nombre: true, direccion: true } }) : null;
}

export type EntradaAjustesPedidos = {
  prefijo: string;
  horasReserva: number;
  /** Cuántos días vale una cotización. */
  diasCotizacion: number;
  /** Las paqueterías que se ofrecen al marcar un pedido como enviado. */
  paqueterias: string[];
  descuentoMaxAgente: number;
  inventario: ModoInventario;
  metodos: string[];
  /** Monto en quetzales desde el que el envío es gratis; vacío = sin mínimo. */
  envioGratisDesde: string;
  /** Lo que cuesta el envío con pago contra entrega, en quetzales (Q35 de fábrica). */
  costoContraEntrega: string;
  /** Con las demás formas de pago el envío es gratis (no se cobra el costo de la zona). */
  envioGratisSinContraEntrega: boolean;
  ubicacionRecogerId: string | null;
  ubicacionEnvioId: string | null;
};

export async function guardarAjustesPedidos(d: EntradaAjustesPedidos, actor: Actor): Promise<Resultado> {
  const prefijo = d.prefijo.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,6}$/.test(prefijo)) return fallo("El prefijo lleva de 1 a 6 letras, números o guiones, por ejemplo HO-.");
  if (!Number.isInteger(d.horasReserva) || d.horasReserva < 1 || d.horasReserva > 720) return fallo("Las horas de reserva van de 1 a 720.");
  if (!Number.isInteger(d.diasCotizacion) || d.diasCotizacion < 1 || d.diasCotizacion > 30) return fallo("Los días que vale una cotización van de 1 a 30.");
  const paqueterias = d.paqueterias.map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (paqueterias.length === 0) return fallo("Deje al menos una paquetería (por ejemplo, Forza).");
  if (paqueterias.length > 10) return fallo("Se pueden tener hasta 10 paqueterías.");
  if (paqueterias.some((p) => p.length > 40)) return fallo("El nombre de cada paquetería lleva hasta 40 caracteres.");
  if (new Set(paqueterias.map((p) => p.toLowerCase())).size !== paqueterias.length) return fallo("Hay una paquetería repetida.");
  if (!Number.isInteger(d.descuentoMaxAgente) || d.descuentoMaxAgente < 0 || d.descuentoMaxAgente > 100) return fallo("El descuento máximo del agente va de 0 a 100 %.");

  const permitidos = new Set<string>(metodosSeleccionables());
  if (d.metodos.some((m) => !permitidos.has(m))) return fallo("Alguno de los métodos de pago no está disponible todavía.");
  const metodos = d.metodos as TipoPago[];
  if (metodos.includes("tarjeta") && !pasarela()) return fallo("Para activar la tarjeta hace falta conectar una pasarela de pago (ver la guía de despliegue).");
  if (metodos.length === 0) return fallo("Deje al menos un método de pago activo.");

  let envioGratisDesde: number | null = null;
  if (d.envioGratisDesde.trim()) {
    envioGratisDesde = parsePrecio(d.envioGratisDesde);
    if (!envioGratisDesde) return fallo("Escriba el monto del envío gratis como un precio, por ejemplo 500.00.");
  }
  const costoContraEntrega = d.costoContraEntrega.trim() === "0" ? 0 : parsePrecio(d.costoContraEntrega);
  if (costoContraEntrega === null) return fallo("Escriba el costo del envío contra entrega como un precio, por ejemplo 35.00.");

  const ids = [d.ubicacionRecogerId, d.ubicacionEnvioId].filter((x): x is string => !!x);
  if (ids.length !== 2) return fallo("Elija de qué ubicación sale cada tipo de entrega.");
  if ((await db.location.count({ where: { id: { in: ids }, activa: true } })) !== new Set(ids).size) return fallo("Alguna de las ubicaciones ya no existe o está desactivada.");

  const datos = { prefijo, horasReserva: d.horasReserva, diasCotizacion: d.diasCotizacion, paqueterias, descuentoMaxAgente: d.descuentoMaxAgente, inventario: d.inventario, metodos, envioGratisDesde, costoContraEntrega, envioGratisSinContraEntrega: d.envioGratisSinContraEntrega, ubicacionRecogerId: d.ubicacionRecogerId, ubicacionEnvioId: d.ubicacionEnvioId };
  await obtenerAjustesPedidos();
  await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: datos });
  await log(actor, "ajustes_pedidos", "AjustesPedidos", "pedidos", { ...datos, metodos: metodos.join(","), paqueterias: paqueterias.join(", ") });
  return { ok: true };
}

/* ── Cuentas bancarias ── */
export const listarCuentas = () => db.bankAccount.findMany({ orderBy: [{ orden: "asc" }, { banco: "asc" }] });

export type EntradaCuenta = { banco: string; tipo: TipoCuenta; numero: string; titular: string; activa: boolean };

export async function guardarCuenta(id: string | null, d: EntradaCuenta, actor: Actor): Promise<Resultado> {
  const banco = d.banco.trim();
  const numero = d.numero.trim();
  const titular = d.titular.trim();
  if (!banco) return fallo("Escriba el nombre del banco.");
  if (banco.length > 60) return fallo("El nombre del banco pasa de 60 caracteres.");
  if (!/^[0-9A-Za-z][0-9A-Za-z -]{3,39}$/.test(numero)) return fallo("El número de cuenta lleva de 4 a 40 caracteres: números, letras, espacios o guiones.");
  if (!titular) return fallo("Escriba el nombre del titular.");
  if (titular.length > 80) return fallo("El nombre del titular pasa de 80 caracteres.");
  if (d.tipo !== "monetaria" && d.tipo !== "ahorro") return fallo("Elija si la cuenta es monetaria o de ahorro.");

  const datos = { banco, tipo: d.tipo, numero, titular, activa: d.activa };
  if (id) {
    if ((await db.bankAccount.updateMany({ where: { id }, data: datos })).count === 0) return fallo("La cuenta ya no existe.");
  } else {
    const ultima = await db.bankAccount.aggregate({ _max: { orden: true } });
    id = (await db.bankAccount.create({ data: { ...datos, orden: (ultima._max.orden ?? 0) + 1 } })).id;
  }
  await log(actor, "guardar_cuenta", "BankAccount", id, { banco, activa: d.activa });
  return { ok: true };
}

export async function borrarCuenta(id: string, actor: Actor): Promise<Resultado> {
  const c = await db.bankAccount.findUnique({ where: { id } });
  if (!c) return { ok: true };
  await db.bankAccount.delete({ where: { id } });
  await log(actor, "borrar_cuenta", "BankAccount", id, { banco: c.banco });
  return { ok: true };
}

/* ── Zonas de envío ── */
export const listarZonas = async (): Promise<Zona[]> => (await db.shippingZone.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] })).map((z) => ({ id: z.id, nombre: z.nombre, departamentos: z.departamentos, municipios: z.municipios, costo: z.costo, tiempo: z.tiempo, activa: z.activa }));

/** Una zona cubre departamentos enteros o, además, solo algunos municipios de ellos. Sin ninguno de los dos es «el resto del país». */
export type EntradaZona = { nombre: string; departamentos: string[]; municipios: string[]; costo: string; tiempo: string; activa: boolean };

export async function guardarZona(id: string | null, d: EntradaZona, actor: Actor): Promise<Resultado> {
  const nombre = d.nombre.trim();
  const tiempo = d.tiempo.trim();
  if (!nombre) return fallo("Escriba el nombre de la zona.");
  if (nombre.length > 60) return fallo("El nombre de la zona pasa de 60 caracteres.");
  const departamentos: string[] = [];
  for (const x of d.departamentos) {
    const oficial = departamentoOficial(x);
    if (!oficial) return fallo(`«${x}» no es un departamento de Guatemala.`);
    if (!departamentos.includes(oficial)) departamentos.push(oficial);
  }
  const municipios: string[] = [];
  for (const x of d.municipios) {
    const oficial = departamentos.map((dep) => municipioOficial(dep, x)).find(Boolean);
    if (!oficial) return fallo(departamentos.length === 0 ? "Elija primero el departamento de los municipios." : `«${x}» no es un municipio de los departamentos elegidos.`);
    if (!municipios.includes(oficial)) municipios.push(oficial);
  }
  const costo = d.costo.trim() === "0" ? 0 : parsePrecio(d.costo);
  if (costo === null) return fallo("Escriba el costo como un precio, por ejemplo 35.00.");
  if (!tiempo) return fallo("Escriba el tiempo estimado, por ejemplo 1 a 2 días.");
  if (tiempo.length > 60) return fallo("El tiempo estimado pasa de 60 caracteres.");

  const datos = { nombre, departamentos, municipios, costo, tiempo, activa: d.activa };
  if (id) {
    if ((await db.shippingZone.updateMany({ where: { id }, data: datos })).count === 0) return fallo("La zona ya no existe.");
  } else {
    const ultima = await db.shippingZone.aggregate({ _max: { orden: true } });
    id = (await db.shippingZone.create({ data: { ...datos, orden: (ultima._max.orden ?? 0) + 1 } })).id;
  }
  await log(actor, "guardar_zona", "ShippingZone", id, { nombre, costo });
  return { ok: true };
}

/** La dirección de una tienda: sale en el resumen y en el aviso «listo para recoger» cuando el cliente recoge ahí. */
export async function guardarDireccionTienda(id: string, texto: string, actor: Actor): Promise<Resultado> {
  const direccion = texto.trim();
  if (!direccion) return fallo("Escriba la dirección de la tienda.");
  if (direccion.length > 300) return fallo("La dirección pasa de 300 caracteres.");
  const t = await db.location.findUnique({ where: { id }, select: { nombre: true } });
  if (!t) return fallo("La tienda ya no existe.");
  await db.location.update({ where: { id }, data: { direccion } });
  await log(actor, "guardar_tienda", "Location", id, { nombre: t.nombre });
  return { ok: true };
}

export async function borrarZona(id: string, actor: Actor): Promise<Resultado> {
  const z = await db.shippingZone.findUnique({ where: { id } });
  if (!z) return { ok: true };
  await db.shippingZone.delete({ where: { id } });
  await log(actor, "borrar_zona", "ShippingZone", id, { nombre: z.nombre });
  return { ok: true };
}

/* ── Mensajes al cliente ── */
const VARIABLES = ["codigo", "total", "saldo", "cuentas", "direccion", "horario", "guia", "horas", "motivo", "enlace"];

/** Guarda los textos editados y qué avisos están encendidos. Una variable que no existe se rechaza para que no salga un {error} al cliente. */
export async function guardarMensajes(d: Record<string, { activo: boolean; texto: string }>, actor: Actor): Promise<Resultado> {
  const claves = new Set<string>(CLAVES_MENSAJE);
  const limpio: Record<string, { activo: boolean; texto: string }> = {};
  for (const [k, v] of Object.entries(d)) {
    if (!claves.has(k)) return fallo("Hay un mensaje que no existe.");
    const texto = v.texto.trim();
    if (!texto) return fallo(`Escriba el texto de «${MENSAJES[k as ClaveMensaje].titulo}» o apáguelo.`);
    if (texto.length > 1000) return fallo(`«${MENSAJES[k as ClaveMensaje].titulo}» pasa de 1000 caracteres.`);
    const mala = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).find((x) => !VARIABLES.includes(x));
    if (mala) return fallo(`En «${MENSAJES[k as ClaveMensaje].titulo}», la variable {${mala}} no existe. Use: ${VARIABLES.map((x) => `{${x}}`).join(", ")}.`);
    limpio[k] = { activo: !!v.activo, texto };
  }
  await obtenerAjustesPedidos();
  await db.ajustesPedidos.update({ where: { id: "pedidos" }, data: { mensajes: limpio } });
  await log(actor, "mensajes_pedidos", "AjustesPedidos", "pedidos", { apagados: Object.entries(limpio).filter(([, v]) => !v.activo).map(([k]) => k).join(",") });
  return { ok: true };
}
