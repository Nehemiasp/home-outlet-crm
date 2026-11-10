/** Minúsculas y sin tildes, para comparar textos sin importar cómo los escribió el cliente. */
export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const SOBRAN = new Set(
  "de la el los las un una unos unas para con en por que qué como cómo cual cuál cuanto cuánto cuesta cuestan vale precio precios tienen tiene hay tienda tendran quiero quisiera necesito buscando busco sobre del al lo le les me mi mis tu su se es son esta este estan y o a si no ya muy mas más favor buenas buenos dias dias tardes noches hola gracias podria podrian puede pueden saber informacion disponible disponibles existencia stock tambien también donde dónde cuando cuándo hello hi how much is the an do you have of cost for on are there any want need price please thanks".split(" ").map(normalizar),
);

/** Palabras que sí dicen algo (sin conectores ni palabras de pregunta). */
export const palabras = (s: string) => normalizar(s).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 2 && !SOBRAN.has(p));

/** ¿El mensaje está en inglés? Por palabras frecuentes; ante la duda, español. Lo usan el asistente simulado y el real (ver asistente.ts). */
const MARCAS_EN = /\b(price|how much|do you have|hello|hi|shipping|delivery|open|opening|hours|where|stock|available|warranty|thanks|thank you|please|i want|i need|buy|cost|payment|deposit|account|order|paid|confirmed|receipt|my)\b/;
const MARCAS_ES = /\b(hola|precio|cuanto|tienen|gracias|donde|horario|envio|quiero|necesito|buenas|cuesta)\b/;

export const esIngles = (texto: string) => {
  const t = normalizar(texto);
  return MARCAS_EN.test(t) && !MARCAS_ES.test(t);
};
