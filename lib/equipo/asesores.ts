import { db } from "@/lib/db";

/** Los asesores activos (rol agente), para los filtros «Asesor» y los menús de asignación del administrador. */
export const listarAsesores = () => db.user.findMany({ where: { rol: "agente", activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
