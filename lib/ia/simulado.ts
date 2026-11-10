import { randomUUID } from "node:crypto";
import { MODO, type AiProvider, type LlamadaHerramienta, type MensajeIa } from "./tipos";
import { esIngles, normalizar } from "./texto";

export { esIngles };

/**
 * Proveedor simulado: reglas por palabras clave que imitan al asistente y llaman a las mismas herramientas que el real.
 * Sirve para probar todo el flujo sin clave de API ni costo.
 */

type Intento =
  | { tipo: "derivar"; motivo: string; clave: "persona" | "compra" | "descuento" | "reclamo" }
  | { tipo: "datos"; campo: "nombre" | "municipio"; valor: string }
  | { tipo: "estado_pedido" | "cuenta" | "horario" | "ubicacion" | "envios" | "pagos" | "garantia" | "faq" | "producto" | "seguimiento" | "gracias" | "saludo" | "injection" | "tema" };

const tiene = (t: string, re: RegExp) => re.test(t);
/** Palabras clave → motivo. Lo usan también el etiquetado automático y el resumen. */
export function motivoPorPalabras(texto: string): (typeof import("./tipos").MOTIVOS)[number] {
  const t = normalizar(texto);
  if (tiene(t, /reclamo|queja|danado|defectuos|no funciona|no sirve|falla|problema con/)) return "reclamo";
  if (tiene(t, /garantia/)) return "garantia";
  if (tiene(t, /comprar|apartar|reservar|pagar|me lo llevo|lo quiero|lo llevo|quiero llevar|pedido/)) return "compra";
  if (tiene(t, /descuento|rebaja|mejor precio|mas barato|precio|cuesta|cuanto vale|cuanto cuesta|price|how much|cost/)) return "precio";
  if (tiene(t, /envio|envian|entrega|domicilio|mandan|despachan|shipping|delivery/)) return "envio";
  if (tiene(t, /horario|a que hora|abren|cierran|atienden|hours|open/)) return "horario";
  if (tiene(t, /\bhay\b|tienen|existencia|disponible|stock|quedan|available|in stock/)) return "existencia";
  return "otro";
}

function clasificar(pregunta: string, textoAsistentePrevio: string): Intento {
  const t = normalizar(pregunta);
  if (tiene(t, /\b(asesor|asesora|persona|humano|agente)\b/)) return { tipo: "derivar", clave: "persona", motivo: "pidió hablar con una persona" };
  if (tiene(t, /ignora|olvida tus|instrucciones|prompt|system|tus reglas|ignore your|jailbreak/)) return { tipo: "injection" };
  if (tiene(t, /descuento|rebaja|mas barato|mejor precio|negociar|ultimo precio|oferta/)) return { tipo: "derivar", clave: "descuento", motivo: "pide descuento" };
  if (tiene(t, /reclamo|queja|danado|defectuos|no funciona|no sirve|falla|problema con/)) return { tipo: "derivar", clave: "reclamo", motivo: "reclamo, garantía o problema con un pedido" };
  // Decir que ya pagó es de un asesor; preguntar por su pedido, su pago o a qué cuenta depositar se responde con estado_pedido.
  if (tiene(t, /\b(ya pague|ya deposite|ya transferi|hice (el|la|mi) (pago|deposito|transferencia)|i (already|just) paid)\b/)) return { tipo: "derivar", clave: "compra", motivo: "dice que ya pagó" };
  if (tiene(t, /a que cuenta|numero de cuenta|cuentas? (bancari|para)|a donde (deposito|transfiero|pago)|donde (deposito|transfiero)|which account|bank account|where (do|can) i (deposit|transfer|pay)/)) return { tipo: "cuenta" };
  if (tiene(t, /\b(mi|mis) (pedido|pago|deposito|transferencia|comprobante)|(estado|status) (de|del|of) (mi|my|el|the) ?(pedido|order)|ya (confirmaron|recibieron|acreditaron|verificaron)|cuando (llega|me llega|estara listo|puedo recoger)|my (order|payment|deposit|transfer)|been confirmed|where is my|\b[a-z]{2,6}-\d{3,8}\b/)) return { tipo: "estado_pedido" };
  // Preguntar cómo se paga (tarjeta, transferencia…) es una consulta; querer pagar o comprar ya es una compra.
  const metodosDePago = /tarjeta|efectivo|transferencia|formas? de pago|metodos? de pago|como pago|aceptan|payment/;
  if (tiene(t, /comprar|compro\b|apartar|aparto\b|reservar|me lo llevo|lo quiero|lo llevo|quiero llevar|hacer el pedido|i want to buy|buy it/)) return { tipo: "derivar", clave: "compra", motivo: "quiere comprar o apartar" };
  if (tiene(t, /pagar\b/) && !tiene(t, metodosDePago)) return { tipo: "derivar", clave: "compra", motivo: "quiere pagar" };
  const nombre = pregunta.match(/\bme llamo ([A-Za-zÁÉÍÓÚáéíóúÑñ]+)/i)?.[1];
  const municipio = pregunta.match(/\bsoy de ([A-Za-zÁÉÍÓÚáéíóúÑñ ]{3,30})/i)?.[1]?.trim();
  if (nombre) return { tipo: "datos", campo: "nombre", valor: nombre };
  if (municipio) return { tipo: "datos", campo: "municipio", valor: municipio };
  if (tiene(t, /horario|a que hora|abren|cierran|atienden|hours|opening|are you open/)) return { tipo: "horario" };
  if (tiene(t, /ubicacion|ubicados|direccion|como llego|donde (estan|queda|se encuentran)|where are you|address/)) return { tipo: "ubicacion" };
  if (tiene(t, /envio|envian|entrega|domicilio|mandan|despachan|shipping|delivery/)) return { tipo: "envios" };
  if (tiene(t, /garantia|warranty/)) return { tipo: "garantia" };
  if (tiene(t, /tarjeta|efectivo|transferencia|formas? de pago|metodos? de pago|como pago|aceptan|payment/)) return { tipo: "pagos" };
  if (tiene(t, /cambio|devolucion|instala|apartado|apartan|factura|mayoreo|mayorista/)) return { tipo: "faq" };
  if (tiene(t, /tienda fisica|en la tienda|tienda en linea|en linea|\blocal\b/) && /cuesta|precio|existencia|unidades|disponible|stock/.test(normalizar(textoAsistentePrevio))) return { tipo: "seguimiento" };
  if (tiene(t, /^(gracias|muchas gracias|ok gracias|listo gracias|perfecto gracias|thanks|thank you)/)) return { tipo: "gracias" };
  if (tiene(t, /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hi|hello)\b/) && t.split(/\s+/).length <= 4) return { tipo: "saludo" };
  return { tipo: "producto" };
}

const llamada = (name: string, args: unknown): LlamadaHerramienta => ({ id: randomUUID(), name, arguments: args });
const ahora = (r: { toolCalls: LlamadaHerramienta[] }) => ({ toolCalls: r.toolCalls });
const lee = (res?: { content: string }) => {
  try {
    return res ? JSON.parse(res.content) : undefined;
  } catch {
    return undefined;
  }
};
// Sin existencia (ver herramientas.ts): ante «¿hay?», el producto, el precio y la oferta de un asesor para hacer el pedido.
const ofrecerAsesor = (en: boolean) => (en ? "Would you like me to connect you with an agent to place your order?" : "¿Desea que le comunique con un asesor para hacer su pedido?");
const primeras = (t: string, n = 2) => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).slice(0, n).join(" ").trim();

/** Nombre del último producto del que se habló: una tarjeta enviada o un "X cuesta …" del asistente. */
function ultimoProductoMencionado(previos: MensajeIa[]): string | undefined {
  for (const m of [...previos].reverse()) {
    const nombre = m.content.match(/\[Se envió la tarjeta del producto: ([^\]]+)\]/)?.[1] ?? m.content.match(/^(.+?) (?:cuesta|costs)\b/m)?.[1];
    if (nombre) return nombre;
  }
}

const ESTADO_EN: Record<string, string> = {
  pendiente_pago: "waiting for payment", en_revision: "under payment review", pagado: "paid", preparando: "being prepared", listo_para_recoger: "ready for pickup",
  enviado: "on its way", entregado: "delivered", cancelado: "cancelled", vencido: "expired",
};

const BORRADORES = {
  persona: "Con gusto le ayudo. ¿En qué le puedo servir?",
  compra: "Con gusto le ayudo con su compra. ¿Prefiere recoger en la tienda o que se lo enviemos? Me confirma su nombre y municipio, por favor.",
  descuento: "Gracias por su interés. Déjeme revisar con el encargado si podemos mejorar el precio y le confirmo en un momento.",
  reclamo: "Lamento el inconveniente. ¿Me cuenta qué ocurrió y cuándo hizo la compra para revisarlo de inmediato?",
} as const;

/** Decide qué hace el asistente simulado con lo que hay en la conversación. */
function decidir(system: string, messages: MensajeIa[]): { text?: string; toolCalls?: LlamadaHerramienta[] } {
  const sugerencia = system.includes(MODO.sugerencia);
  const ultimoDelCliente = messages.map((m, i) => ({ m, i })).filter(({ m }) => m.role === "user" && m.content.trim() !== "").at(-1);
  if (!ultimoDelCliente) return { text: "¿En qué le puedo ayudar?" };
  const pregunta = ultimoDelCliente.m.content;
  const turno = messages.slice(ultimoDelCliente.i + 1);
  const llamadas = turno.flatMap((m) => m.toolCalls ?? []);
  const resultados = turno.flatMap((m) => m.toolResults ?? []);
  const de = (nombre: string) => lee(resultados.find((r) => r.name === nombre));
  const hizo = (nombre: string) => llamadas.some((l) => l.name === nombre);
  const en = esIngles(pregunta);
  const previoAsistente = messages.slice(0, ultimoDelCliente.i).filter((m) => m.role === "assistant").at(-1)?.content ?? "";
  const intento = clasificar(pregunta, previoAsistente);
  const sinDatos = en ? "I don't have that information. Would you like me to connect you with an agent?" : "No tengo ese dato registrado. ¿Desea que le comunique con un asesor?";
  const fueraDeTema = en ? "I can only help with Home Outlet products, prices, hours, shipping and payment methods." : "Solo puedo ayudarle con productos, precios, horarios, envíos y formas de pago de Home Outlet.";

  switch (intento.tipo) {
    case "derivar":
      return sugerencia ? { text: BORRADORES[intento.clave] } : { toolCalls: [llamada("pasar_a_asesor", { motivo: intento.motivo })] };

    case "injection":
      return { text: fueraDeTema };

    case "datos": {
      if (!hizo("guardar_dato_cliente")) return ahora({ toolCalls: [llamada("guardar_dato_cliente", { campo: intento.campo, valor: intento.valor })] });
      return { text: en ? `Thank you, ${intento.valor}. How can I help you?` : `Gracias, ${intento.valor}. ¿En qué le puedo ayudar?` };
    }

    case "estado_pedido":
    case "cuenta": {
      if (!hizo("estado_pedido")) {
        const codigo = pregunta.match(/\b([A-Za-z]{2,6}-\d{3,8})\b/)?.[1];
        return ahora({ toolCalls: [llamada("estado_pedido", codigo ? { codigo } : {})] });
      }
      const o = de("estado_pedido")?.pedido as
        | { codigo: string; estado: string; estado_texto: string; pago_confirmado: boolean; saldo: string; entrega: string; guia: string | null; tiempo_estimado: string | null; cuentas?: string }
        | null
        | undefined;
      if (!o) {
        if (intento.tipo === "cuenta") return sugerencia ? { text: BORRADORES.compra } : { toolCalls: [llamada("pasar_a_asesor", { motivo: "quiere pagar y no tiene un pedido creado" })] };
        return { text: en ? "I can't find an order under your name. Would you like me to connect you with an agent?" : "No encuentro un pedido a su nombre. ¿Desea que le comunique con un asesor?" };
      }
      const c = o.codigo;
      if (intento.tipo === "cuenta") {
        if (o.estado === "pendiente_pago" && o.cuentas)
          return { text: en ? `You can pay order ${c} by bank transfer or deposit to:
${o.cuentas}
Please send a photo of the receipt in this chat.` : `Puede pagar su pedido ${c} por transferencia o depósito a:
${o.cuentas}
Envíe una foto del comprobante por este chat.` };
        if (o.estado === "en_revision") return { text: en ? `Your order ${c} already has a receipt under review, so you don't need to pay again.` : `Su pedido ${c} ya tiene un comprobante en revisión, no necesita depositar de nuevo.` };
        return { text: en ? `Your order ${c} is ${ESTADO_EN[o.estado] ?? o.estado}.` : `Su pedido ${c} está ${o.estado_texto}.` };
      }
      const sobrePago = /pago|deposito|transferencia|comprobante|confirm|recib|acredit|payment|deposit|transfer/.test(normalizar(pregunta));
      if (sobrePago) {
        if (o.pago_confirmado) return { text: en ? `Your payment for order ${c} is confirmed.` : `Su pago del pedido ${c} está confirmado.` };
        if (o.estado === "en_revision") return { text: en ? `We received your receipt for order ${c} and it is under review. We will let you know once it is confirmed.` : `Recibimos su comprobante del pedido ${c} y está en revisión. Le avisamos en cuanto se confirme.` };
        if (o.estado === "pendiente_pago") return { text: en ? `We don't see the payment for order ${c} yet. ${o.saldo} is still due. You can send a photo of the receipt in this chat.` : `Todavía no vemos el pago del pedido ${c}. Falta ${o.saldo}. Puede enviar la foto del comprobante por este chat.` };
        return { text: en ? `Your order ${c} is ${ESTADO_EN[o.estado] ?? o.estado}.` : `Su pedido ${c} está ${o.estado_texto}.` };
      }
      const base = en ? `Your order ${c} is ${ESTADO_EN[o.estado] ?? o.estado}.` : `Su pedido ${c} está ${o.estado_texto}.`;
      const extra =
        o.estado === "enviado" && o.guia ? (en ? ` Tracking number: ${o.guia}.` : ` Número de guía: ${o.guia}.`)
        : o.estado === "listo_para_recoger" ? (en ? " You can pick it up at the store." : " Puede pasar a recogerlo a la tienda.")
        : o.estado === "pendiente_pago" ? (en ? ` ${o.saldo} is still due.` : ` Falta el pago: ${o.saldo}.`)
        : o.entrega === "envio" && o.tiempo_estimado && ["pagado", "preparando"].includes(o.estado) ? (en ? ` Estimated delivery time: ${o.tiempo_estimado}.` : ` El tiempo estimado de entrega es ${o.tiempo_estimado}.`)
        : "";
      return { text: base + extra };
    }

    case "gracias":
      return { text: en ? "You're welcome. Anything else I can help you with?" : "Con gusto. ¿Le ayudo con algo más?" };

    case "saludo":
      return { text: en ? "Hello! I can check prices, hours and shipping for you." : "Hola, ¿en qué le puedo ayudar? Puedo consultar precios, horarios y envíos." };

    case "horario": {
      if (!hizo("datos_negocio")) return ahora({ toolCalls: [llamada("datos_negocio", {})] });
      const d = de("datos_negocio");
      if (!d?.horario) return { text: sinDatos };
      return { text: en ? `Our hours: ${d.horario}.` : `Nuestro horario es: ${String(d.horario).replace(/\.$/, "")}.` };
    }

    case "ubicacion": {
      if (!hizo("datos_negocio")) return ahora({ toolCalls: [llamada("datos_negocio", {})] });
      const d = de("datos_negocio");
      if (!d?.direccion) return { text: sinDatos };
      return { text: en ? `You can find us at:\n${d.direccion}` : `Aquí nos encuentra:\n${d.direccion}` };
    }

    case "pagos":
    case "garantia": {
      const campo = intento.tipo === "pagos" ? "formas_de_pago" : "garantia";
      if (!hizo("datos_negocio")) return ahora({ toolCalls: [llamada("datos_negocio", {})] });
      const d = de("datos_negocio");
      if (d?.[campo]) return { text: String(d[campo]) };
      if (!hizo("buscar_respuesta")) return ahora({ toolCalls: [llamada("buscar_respuesta", { pregunta })] });
      const f = de("buscar_respuesta");
      return { text: f?.[0] ? primeras(f[0].respuesta) : sinDatos };
    }

    case "envios":
    case "faq": {
      if (!hizo("buscar_respuesta")) return ahora({ toolCalls: [llamada("buscar_respuesta", { pregunta })] });
      const f = de("buscar_respuesta");
      if (f?.[0]) return { text: primeras(f[0].respuesta) };
      if (intento.tipo === "envios" && !hizo("datos_negocio")) return ahora({ toolCalls: [llamada("datos_negocio", {})] });
      const d = de("datos_negocio");
      return { text: intento.tipo === "envios" && d?.envios ? String(d.envios) : sinDatos };
    }

    case "seguimiento": {
      const nombre = previoAsistente.match(/^(.+?) (cuesta|costs)\b/m)?.[1];
      if (!nombre) return { text: sinDatos };
      if (!hizo("buscar_productos")) return ahora({ toolCalls: [llamada("buscar_productos", { texto: nombre })] });
      const lista = de("buscar_productos");
      if (!lista?.[0]) return { text: sinDatos };
      if (!hizo("ver_producto")) return ahora({ toolCalls: [llamada("ver_producto", { id: lista[0].id })] });
      const p = de("ver_producto");
      return { text: en ? `${p.nombre} costs ${p.precio}. ${ofrecerAsesor(en)}` : `${p.nombre} cuesta ${p.precio}. ${ofrecerAsesor(en)}` };
    }

    case "producto": {
      const t = normalizar(pregunta);
      const pideFoto = /foto|imagen|mostr|muestr|ensen|mandeme|enviem|picture|photo|show me/.test(t);
      // "¿Podría mostrarme el producto?" sin nombrarlo: se refiere al último producto de la conversación.
      const sinNombre = pideFoto && t.replace(/\b(podrias?|puedes?|puede|me|mostr\w*|muestr\w*|ensen\w*|mand\w*|envi\w*|fotos?|imagen(es)?|mas|otras|todas|tiene|tienen|del?|el|la|lo|los|las|un|una|ese|esa|eso|este|esta|esto|producto|articulo|por|favor|quiero|ver|y|a)\b|[^a-z0-9]/g, "") === "";
      const previo = sinNombre ? ultimoProductoMencionado(messages.slice(0, ultimoDelCliente.i)) : undefined;
      if (sinNombre && !previo) return { text: en ? "Which product would you like to see? Tell me its name." : "¿Cuál producto le gustaría ver? Dígame el nombre." };
      if (!hizo("buscar_productos")) return ahora({ toolCalls: [llamada("buscar_productos", { texto: previo ?? pregunta })] });
      const lista = de("buscar_productos") as { id: string; nombre: string; precio: string }[] | undefined;
      if (!lista?.length) {
        if (!hizo("buscar_respuesta")) return ahora({ toolCalls: [llamada("buscar_respuesta", { pregunta })] });
        const f = de("buscar_respuesta");
        if (f?.[0]) return { text: primeras(f[0].respuesta) };
        const sePareceAProducto = /precio|cuesta|cuanto|hay\b|tienen|existencia|disponible|price|how much|stock/.test(normalizar(pregunta));
        return { text: sePareceAProducto ? (en ? "I couldn't find that product in our catalog. Would you like me to connect you with an agent?" : "No encontré ese producto en el catálogo. ¿Desea que le comunique con un asesor?") : fueraDeTema };
      }
      if (lista.length === 1 || pideFoto) {
        const p = lista[0]!;
        // «Más fotos», «otras fotos», «todas las fotos»: van todas las del producto; si solo pide verlo, la tarjeta con la principal.
        const pideMas = /(mas|otras|todas las) (fotos|imagenes)|more (photos|pictures)|other (photos|pictures)|all (the )?(photos|pictures)/.test(t);
        if (pideFoto && !hizo("enviar_producto")) return ahora({ toolCalls: [llamada("enviar_producto", pideMas ? { id: p.id, todas_las_fotos: true } : { id: p.id })] });
        return { text: en ? `${p.nombre} costs ${p.precio}.` : `${p.nombre} cuesta ${p.precio}.` };
      }
      const tres = lista.slice(0, 3).map((p) => `${p.nombre} (${p.precio})`);
      const unidos = tres.length === 3 ? `${tres[0]}, ${tres[1]} ${en ? "and" : "y"} ${tres[2]}` : tres.join(en ? " and " : " y ");
      return { text: en ? `I found these options: ${unidos}. Which one are you interested in?` : `Encontré estas opciones: ${unidos}. ¿Cuál le interesa?` };
    }

    case "tema":
      return { text: fueraDeTema };
  }
}

/** Resumen: 3 a 5 líneas armadas con reglas, a partir de la conversación que llega como una sola transcripción. */
function resumir(texto: string): string {
  const lineas = texto.split("\n");
  const estado = lineas.find((l) => l.startsWith("ESTADO:"))?.slice(7).trim() ?? "";
  const cliente = lineas.filter((l) => l.startsWith("Cliente:")).map((l) => l.slice(8).trim());
  const enviados = [...texto.matchAll(/\[Producto enviado: ([^\]]+)\]/g)].map((m) => m[1]!);
  const cotizados = [...texto.matchAll(/^(?:Asistente|Asesor): (.+?) cuesta /gm)].map((m) => m[1]!);
  const productos = [...new Set([...enviados, ...cotizados])];
  const motivo = motivoPorPalabras(cliente.join(" "));
  const TEXTO_MOTIVO: Record<string, string> = { precio: "precios", existencia: "existencias", envio: "envíos", horario: "el horario", compra: "una compra", reclamo: "un reclamo", garantia: "la garantía", otro: "información general" };
  const out = [`El cliente escribió sobre ${TEXTO_MOTIVO[motivo]}${cliente[0] ? `: «${cliente[0].slice(0, 90)}${cliente[0].length > 90 ? "…" : ""}»` : ""}.`];
  out.push(productos.length ? `Productos mencionados: ${productos.slice(0, 4).join(", ")}.` : "No se mencionó ningún producto en particular.");
  const alUltimo = cliente.at(-1);
  if (cliente.length > 1 && alUltimo) out.push(`Su último mensaje fue: «${alUltimo.slice(0, 90)}${alUltimo.length > 90 ? "…" : ""}».`);
  const turnos = lineas.filter((l) => /^(Cliente|Asistente|Asesor):/.test(l));
  const ultimoCliente = turnos.map((l) => l.startsWith("Cliente:")).lastIndexOf(true);
  const personaRespondio = turnos.slice(ultimoCliente + 1).some((l) => l.startsWith("Asesor:"));
  out.push(
    estado.includes("esperando asesor")
      ? "Pendiente: un asesor debe tomar la conversación y responder."
      : estado.includes("la atiende un asesor") && !personaRespondio
        ? "Pendiente: el asesor debe responder el último mensaje del cliente."
        : estado.includes("asistente")
          ? "Pendiente: nada por ahora; la atiende el asistente."
          : turnos.at(-1)?.startsWith("Cliente:")
            ? "Pendiente: responder el último mensaje del cliente."
            : "Pendiente: esperar la respuesta del cliente.",
  );
  return out.join("\n");
}

const estimar = (t: string) => Math.ceil(t.length / 4);

export const proveedorSimulado: AiProvider = {
  name: "simulado",
  modelo: "simulado-reglas",
  async respond({ system, messages }) {
    const entrada = estimar(system + messages.map((m) => m.content + JSON.stringify(m.toolResults ?? "")).join(""));
    let r: { text?: string; toolCalls?: LlamadaHerramienta[] };
    const ultimo = messages.at(-1)?.content ?? "";
    if (system.includes(MODO.motivo)) r = { text: motivoPorPalabras(ultimo) };
    else if (system.includes(MODO.resumen)) r = { text: resumir(ultimo) };
    else r = decidir(system, messages);
    return { ...r, usage: { inputTokens: entrada, outputTokens: estimar(r.text ?? JSON.stringify(r.toolCalls ?? "")) } };
  },
};
