import { obtenerNegocio } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { enviarMensaje } from "@/lib/mensajeria";
import { textoCuentas } from "@/lib/plantillas";
import { formatQ } from "@/lib/utils";
import { obtenerAjustesPedidos, tiendaDeRecoger } from "./ajustes";
import { CLAVES_MENSAJE, MENSAJES, rellenar, textoHoras, type ClaveMensaje, type VariablesMensaje } from "./mensajes";
import { puedeEnviarPorCanal } from "./pedidos";
import { saldoDe } from "./totales";

export type ConfigMensajes = Record<ClaveMensaje, { activo: boolean; texto: string }>;

/** Los textos de fábrica con lo que el admin haya editado o apagado en Ajustes. */
export function mezclarConfig(guardado: unknown): ConfigMensajes {
  const g = (guardado && typeof guardado === "object" ? guardado : {}) as Record<string, { activo?: unknown; texto?: unknown } | undefined>;
  return Object.fromEntries(
    CLAVES_MENSAJE.map((k) => [k, { activo: typeof g[k]?.activo === "boolean" ? (g[k]!.activo as boolean) : MENSAJES[k].activo, texto: typeof g[k]?.texto === "string" && (g[k]!.texto as string).trim() ? (g[k]!.texto as string) : MENSAJES[k].texto }]),
  ) as ConfigMensajes;
}

export async function configMensajes(): Promise<ConfigMensajes> {
  return mezclarConfig((await obtenerAjustesPedidos()).mensajes);
}

/** Lo ya verificado, lo que está en revisión y lo que falta pagar de un pedido. */
export async function resumenPagos(pedidoId: string) {
  const [o, pagos] = await Promise.all([db.order.findUniqueOrThrow({ where: { id: pedidoId }, select: { total: true } }), db.payment.findMany({ where: { pedidoId }, select: { monto: true, estado: true } })]);
  const suma = (e: string) => pagos.filter((p) => p.estado === e).reduce((t, p) => t + p.monto, 0);
  const verificado = suma("verificado");
  return { total: o.total, verificado, enRevision: suma("en_revision"), saldo: saldoDe(o.total, verificado) };
}

/** Lo que dice {guia} en el aviso de envío: la paquetería y el número; en una entrega propia, nada. */
export const textoGuia = (paqueteria: string | null, guia: string | null) => (!guia ? "" : paqueteria ? `Paquetería: ${paqueteria}\nNúmero de guía: ${guia}` : `Número de guía: ${guia}`);

/** Las variables de un pedido para rellenar los mensajes. */
export async function variablesDe(pedidoId: string, extra: VariablesMensaje = {}): Promise<VariablesMensaje> {
  const [o, aj, negocio, cuentas, pagos] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: pedidoId } }),
    obtenerAjustesPedidos(),
    obtenerNegocio(),
    db.bankAccount.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { banco: "asc" }] }),
    resumenPagos(pedidoId),
  ]);
  // Al recoger, {direccion} es la de la tienda donde recoge («Tienda Mixco, 4 calle 11-47…»); si no, la de Datos del negocio.
  const tienda = o.entrega === "recoger" ? await tiendaDeRecoger(o.recogerEnId) : null;
  const direccion = tienda ? [tienda.nombre, tienda.direccion].filter(Boolean).join(", ") : (negocio.direccion ?? "");
  return {
    codigo: o.codigo, total: formatQ(o.total), saldo: formatQ(pagos.saldo), cuentas: textoCuentas(cuentas), horas: textoHoras(aj.horasReserva),
    direccion, horario: negocio.horario ?? "", guia: textoGuia(o.paqueteria, o.guia), ...extra,
  };
}

export async function previsualizarAviso(pedidoId: string, clave: ClaveMensaje, extra: VariablesMensaje = {}) {
  const c = (await configMensajes())[clave];
  return { activo: c.activo, texto: rellenar(c.texto, await variablesDe(pedidoId, extra)) };
}

/** `enviado`: salió por el canal. `copiar`: no hay canal o la ventana cerró, se devuelve el texto para mandarlo a mano. `apagado`: el admin lo desactivó. */
export type ResultadoAviso = { estado: "enviado" | "copiar" | "apagado" | "sin-conversacion" | "fallo"; texto?: string; error?: string };

/** Le avisa al cliente por la conversación del pedido. Nunca cambia quién atiende ni lanza error: el aviso es un extra, no frena la operación. */
export async function avisarCliente(pedidoId: string, clave: ClaveMensaje, o: { usuarioId?: string; extra?: VariablesMensaje; textoEditado?: string } = {}): Promise<ResultadoAviso> {
  try {
    const pedido = await db.order.findUnique({ where: { id: pedidoId }, select: { conversacionId: true } });
    if (!pedido?.conversacionId) return { estado: "sin-conversacion" };
    const cfg = (await configMensajes())[clave];
    if (!cfg.activo) return { estado: "apagado" };
    const texto = o.textoEditado?.trim() || rellenar(cfg.texto, await variablesDe(pedidoId, o.extra));
    if (!(await puedeEnviarPorCanal(pedido.conversacionId))) return { estado: "copiar", texto };
    const r = await enviarMensaje({ conversacionId: pedido.conversacionId, usuarioId: o.usuarioId, autor: "asesor", aviso: true, pedidoId, mensaje: { type: "text", text: texto } });
    return r.ok ? { estado: "enviado", texto } : { estado: "fallo", texto, error: r.error };
  } catch {
    return { estado: "fallo", error: "No se pudo enviar el aviso." };
  }
}
