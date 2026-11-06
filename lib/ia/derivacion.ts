import type { obtenerNegocio } from "@/lib/ajustes";
import { estaAbierto } from "@/lib/horario";

/** Lo que se le dice al cliente cuando el asistente pasa la conversación a una persona, según haya o no horario de atención. */
export const textoDerivacion = (n: Awaited<ReturnType<typeof obtenerNegocio>>) =>
  estaAbierto(n.horarioSemanal)
    ? "Le comunico con un asesor, en un momento le responde."
    : `En este momento estamos fuera de horario. Atendemos ${(n.horario ?? "en nuestro horario de atención").replace(/\.$/, "")}. Un asesor le responderá en cuanto abramos.`;
