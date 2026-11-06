import { procesarEventoPasarela } from "@/lib/pagos-tarjeta/cobros";
import { pasarela } from "@/lib/pagos-tarjeta";
import { ipDelCliente } from "@/lib/ip";
import { minutosBloqueado, registrarFallo } from "@/lib/limite-intentos";
import { registrarError } from "@/lib/registro";

// Aviso de la pasarela de pago con tarjeta. Sin firma válida no se procesa nada; las firmas inválidas cuentan contra la IP
// (si hay una confiable, ver lib/ip.ts) igual que en el webhook de los canales. Nunca se registra el contenido.
const MAX_FIRMAS_MALAS = 30;

export async function POST(req: Request) {
  const p = pasarela();
  if (!p) return new Response(null, { status: 404 });

  const cuerpo = await req.text();
  const ip = ipDelCliente(req.headers);
  const clave = ip ? `pagos:${ip}` : null;
  if (clave && (await minutosBloqueado(clave, MAX_FIRMAS_MALAS)) > 0) return new Response(null, { status: 429 });
  if (!p.verificarWebhook(cuerpo, req.headers)) {
    if (clave) await registrarFallo(clave).catch(() => {});
    registrarError("webhook pagos", "firma inválida", { nivel: "aviso" });
    return new Response(null, { status: 401 });
  }

  const evento = p.interpretarWebhook(cuerpo);
  if (!evento) return new Response(null, { status: 200 }); // un evento que no es de un cobro: se acepta y se ignora
  try {
    const r = await procesarEventoPasarela(evento, p);
    // Un cobro desconocido responde 200 igual: el proveedor no debe reintentar para siempre algo que no es nuestro.
    return Response.json({ ok: r.ok }, { status: 200 });
  } catch (e) {
    registrarError("webhook pagos", e);
    return new Response(null, { status: 500 }); // el proveedor reintenta
  }
}
