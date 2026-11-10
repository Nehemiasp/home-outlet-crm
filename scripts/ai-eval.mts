// npm run ai:eval — corre los casos de ai/eval/casos.json contra el proveedor configurado y reporta cuántos pasan.
// No escribe nada en la base salvo, para los casos con `pedido`, un cliente y pedidos temporales (prefijo "EVAL") que se borran al final.
// Guarda el resultado con fecha en ai/eval/resultados/.
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { obtenerNegocio } from "../lib/ajustes";
import { db } from "../lib/db";
import { ejecutarAsistente } from "../lib/ia/asistente";
import { construirSystem } from "../lib/ia/prompt";
import { obtenerProveedor } from "../lib/ia/proveedor";
import { derivacionPrevia, revisarSalida } from "../lib/ia/reglas";
import { normalizar } from "../lib/ia/texto";
import { DESCONTADOS } from "../lib/pedidos/estados";
import { estaAbierto } from "../lib/horario";
import type { EstadoPedido } from "../generated/prisma/client";

type Caso = {
  id: string;
  mensaje: string;
  tipo?: string;
  historial?: { role: "user" | "assistant"; content: string }[];
  /** El cliente del caso tiene un pedido en este estado. {codigo} es el suyo y {codigo_ajeno}, el de otra persona. */
  pedido?: EstadoPedido;
  /**
   * `contiene` y `herramientas`: cada elemento es un texto o una lista de equivalentes (basta uno). El asistente simulado y el modelo
   * real dicen lo mismo con otras palabras («No encuentro» / «No encontré»); se comparan sin mayúsculas ni tildes.
   */
  esperado: { accion: "responde" | "pasa_asesor" | "declina" | "responde_o_pasa"; contiene?: (string | string[])[]; noContiene?: string[]; herramientas?: (string | string[])[]; noHerramientas?: boolean; motivo?: string };
};

const casos: Caso[] = JSON.parse(readFileSync("ai/eval/casos.json", "utf8"));
const proveedor = obtenerProveedor();
const negocio = await obtenerNegocio();
const system = construirSystem({ negocio: negocio.nombre, abierto: estaAbierto(negocio.horarioSemanal) });
const incluye = (texto: string, parte: string) => normalizar(texto).includes(normalizar(parte));
const alguna = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
// Declinar con amabilidad: decir con qué sí puede ayudar (el simulado dice «solo puedo ayudarle…»; el modelo real lo dice a su manera).
const DECLINA = ["solo puedo", "puedo ayudarle con", "le ayudo con", "puedo ayudarle", "can only help", "i can help", "happy to help"];

const CODIGO = "EVAL-000777";
const CODIGO_AJENO = "EVAL-000888";
const rellenar = (t: string) => t.replaceAll("{codigo_ajeno}", CODIGO_AJENO).replaceAll("{codigo}", CODIGO);

/** Un cliente con un pedido en el estado pedido, y otro cliente con un pedido distinto, para probar que no se ve el ajeno. */
async function prepararPedidos(estado: EstadoPedido) {
  await limpiar();
  const propio = await db.contact.create({ data: { nombre: "EVAL cliente" } });
  const ajeno = await db.contact.create({ data: { nombre: "EVAL otra persona" } });
  const base = { canal: "simulado" as const, entrega: "recoger" as const };
  const conGuia = estado === "enviado" ? { entrega: "envio" as const, guia: "GUIA-123", municipio: "Morales" } : {};
  // Un pedido pagado (o más adelante) lleva su pago verificado por el total: sin él quedaba «pagado con saldo pendiente» y el modelo real,
  // con razón, lo pasaba a un asesor por la incoherencia.
  const pagado = DESCONTADOS.includes(estado) ? { pagos: { create: [{ tipo: "transferencia" as const, banco: "EVAL Banco", referencia: "EVAL-REF", monto: 125_000, fechaPago: new Date(), estado: "verificado" as const, verificadoEn: new Date() }] } } : {};
  await db.order.create({ data: { ...base, ...conGuia, ...pagado, codigo: CODIGO, contactoId: propio.id, estado, subtotal: 125_000, total: 125_000 } });
  await db.order.create({ data: { ...base, codigo: CODIGO_AJENO, contactoId: ajeno.id, estado: "pagado", subtotal: 777_700, total: 777_700 } });
  return propio.id;
}
const limpiar = async () => {
  await db.order.deleteMany({ where: { codigo: { startsWith: "EVAL-" } } });
  await db.contact.deleteMany({ where: { nombre: { startsWith: "EVAL " } } });
};

console.log(`Evaluando ${casos.length} casos con el proveedor "${proveedor.name}" (${proveedor.modelo})\n`);
const resultados = [];
let pasan = 0;
try {
  for (const caso of casos) {
    const fallos: string[] = [];
    let texto = "";
    let derivo = false;
    let motivo = "";
    let herramientas: string[] = [];

    const contactoId = caso.pedido ? await prepararPedidos(caso.pedido) : null;
    const mensaje = rellenar(caso.mensaje);
    const pedidoPendiente = caso.pedido === "pendiente_pago" || caso.pedido === "en_revision";
    const previa = derivacionPrevia(mensaje, caso.tipo ?? "text", { pedidoPendiente }); // las reglas del código van antes del modelo
    if (previa) {
      derivo = true;
      motivo = previa;
    } else {
      const r = await ejecutarAsistente({
        proveedor, system,
        historial: [...(caso.historial ?? []).map((h) => ({ ...h, content: rellenar(h.content) })), { role: "user", content: mensaje }],
        contexto: { conversacionId: null, contactoId, sandbox: true },
      });
      // Regla de salida: nunca afirma un pago confirmado si el cliente no tiene un pedido con pago verificado.
      const salida = revisarSalida(r.texto ?? "", !!caso.pedido && DESCONTADOS.includes(caso.pedido));
      texto = salida.texto;
      derivo = !!r.derivar || !!salida.derivar;
      motivo = r.derivar ?? salida.derivar ?? "";
      herramientas = r.herramientas;
      if (r.error) fallos.push("error del proveedor");
    }

    const e = caso.esperado;
    // «responde_o_pasa»: las dos cosas están bien (por ejemplo, un depósito sin pedido: decir que no lo encuentra o pasarlo a un asesor).
    const sePaso = e.accion === "responde_o_pasa" && derivo;
    if (e.accion === "pasa_asesor" && !derivo) fallos.push("debía pasar a un asesor y respondió");
    if ((e.accion === "responde" || e.accion === "declina") && derivo) fallos.push("pasó a un asesor y debía responder");
    if (e.accion === "declina" && !DECLINA.some((d) => incluye(texto, d)) && !derivo) fallos.push('debía declinar con amabilidad, diciendo con qué sí puede ayudar');
    if ((e.accion === "responde" || (e.accion === "responde_o_pasa" && !derivo)) && !texto.trim()) fallos.push("no respondió nada");
    for (const c of sePaso ? [] : (e.contiene ?? [])) if (!alguna(c).some((x) => incluye(texto, rellenar(x)))) fallos.push(`falta «${alguna(c).map(rellenar).join("» o «")}»`);
    for (const c of e.noContiene ?? []) if (incluye(texto, rellenar(c))) fallos.push(`no debía decir «${rellenar(c)}»`);
    for (const h of e.herramientas ?? []) if (!alguna(h).some((x) => herramientas.includes(x))) fallos.push(`debía usar ${alguna(h).join(" o ")}`);
    if (e.noHerramientas && herramientas.length) fallos.push("no debía usar herramientas");
    if (e.motivo && !incluye(motivo, e.motivo)) fallos.push(`el motivo del pase debía incluir «${e.motivo}» y fue «${motivo}»`);

    const ok = fallos.length === 0;
    if (ok) pasan++;
    console.log(`${ok ? "✔" : "✖"} ${caso.id}${ok ? "" : `\n    ${fallos.join("\n    ")}\n    respuesta: ${texto || (derivo ? `(pasó a asesor: ${motivo})` : "(vacía)")}`}`);
    resultados.push({ id: caso.id, ok, fallos, respuesta: texto || null, derivo, motivo: motivo || null, herramientas });
  }
} finally {
  await limpiar();
}

console.log(`\n${pasan} de ${casos.length} casos pasan (${Math.round((pasan / casos.length) * 100)} %).`);
const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
mkdirSync("ai/eval/resultados", { recursive: true });
const archivo = `ai/eval/resultados/${fecha}-${proveedor.name}.json`;
writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), proveedor: proveedor.name, modelo: proveedor.modelo, total: casos.length, pasan, resultados }, null, 2));
console.log(`Resultado guardado en ${archivo}`);
await db.$disconnect();
process.exit(pasan === casos.length ? 0 : 1);
