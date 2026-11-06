import { estadoCanales } from "@/lib/canales";
import { db } from "@/lib/db";
import { horarioValido } from "@/lib/horario";
import { obtenerProveedor } from "@/lib/ia/proveedor";
import { esUsuarioDemo } from "@/lib/limpieza";

/**
 * Lista de «primeros pasos» para poner el sistema a trabajar con datos reales. Cada paso se calcula con lo que hay en la base
 * (no es un interruptor que alguien marque): se pone en «Listo» solo cuando de verdad está hecho.
 */
export type Paso = {
  id: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  /** Dónde se hace. Sin enlace, el paso se hace fuera del sistema (variables del servidor). */
  href?: string;
  accion?: string;
};

export async function evaluarPrimerosPasos(): Promise<Paso[]> {
  const [negocio, cuentas, zonas, productos, conStock, agentes, preguntas, usuarios] = await Promise.all([
    db.negocio.findUnique({ where: { id: "negocio" } }),
    db.bankAccount.count({ where: { activa: true } }),
    db.shippingZone.count({ where: { activa: true } }),
    db.product.count({ where: { activo: true } }),
    db.stock.count({ where: { cantidad: { gt: 0 }, producto: { activo: true } } }),
    db.user.count({ where: { rol: "agente", activo: true } }),
    db.knowledgeItem.count({ where: { activa: true } }),
    db.user.findMany({ select: { correo: true } }),
  ]);
  const canalReal = estadoCanales().some((c) => c.activo && c.canal !== "simulado");
  const hayDemo = usuarios.some((u) => esUsuarioDemo(u.correo));

  return [
    { id: "negocio", titulo: "Datos del negocio", detalle: "Nombre, dirección y horario de atención. El asistente se los dice a los clientes y avisa cuando están cerrados.", hecho: !!negocio?.nombre.trim() && !!negocio.direccion?.trim() && horarioValido(negocio.horarioSemanal), href: "/ajustes/negocio", accion: "Completar datos" },
    { id: "cuentas", titulo: "Cuentas bancarias", detalle: "Las cuentas a las que pagan los clientes por transferencia o depósito. Van en el resumen del pedido.", hecho: cuentas > 0, href: "/ajustes/pagos-envios", accion: "Agregar cuentas" },
    { id: "envios", titulo: "Zonas de envío", detalle: "Municipios, costo y tiempo. Si solo se vende para recoger en tienda, este paso se puede dejar así.", hecho: zonas > 0, href: "/ajustes/pagos-envios", accion: "Agregar zonas" },
    { id: "catalogo", titulo: "Catálogo con existencias", detalle: "Productos con precio y cuántas unidades hay en cada lugar. Se puede importar un archivo CSV.", hecho: productos > 0 && conStock > 0, href: "/catalogo/importar", accion: "Importar productos" },
    { id: "equipo", titulo: "Equipo", detalle: "Crear a los agentes (y al jefe de tienda si lo hay). Cada persona recibe una contraseña que le entrega el administrador (solo él puede cambiarlas o restablecerlas).", hecho: agentes > 0, href: "/ajustes/usuarios", accion: "Invitar usuarios" },
    { id: "preguntas", titulo: "Preguntas frecuentes", detalle: "Al menos 5 preguntas con su respuesta, para que el asistente conteste como el negocio.", hecho: preguntas >= 5, href: "/ajustes/asistente/preguntas", accion: "Escribir preguntas" },
    { id: "canales", titulo: "Un canal real conectado", detalle: "WhatsApp, Facebook o Instagram, con sus credenciales de Meta. Hasta entonces solo funciona el canal de prueba.", hecho: canalReal, href: "/ajustes/canales", accion: "Ver canales" },
    { id: "ia", titulo: "Asistente con inteligencia artificial real", detalle: "Se activa con la clave de Anthropic en el servidor (AI_PROVIDER y ANTHROPIC_API_KEY). Sin ella responde un modo de prueba.", hecho: obtenerProveedor().name === "anthropic" },
    { id: "respaldo", titulo: "Respaldo diario activado", detalle: "El sistema guarda cada noche la base y los archivos. Se activa en el servidor con RESPALDO_AUTOMATICO=1 (ver la guía de despliegue).", hecho: process.env.RESPALDO_AUTOMATICO === "1" },
    { id: "demo", titulo: "Sin datos de demostración", detalle: "Hay usuarios de demostración en el sistema. Los datos de ejemplo se borran con «npm run demo:limpiar» (primero muestra qué borraría).", hecho: !hayDemo },
  ];
}
