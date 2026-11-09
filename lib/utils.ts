export const cn = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(" ");

/** «Ana», «Ana y Carlos», «Ana, Carlos y Luis». */
export const juntarNombres = (nombres: string[]) => (nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`);

/** Precio en centavos de quetzal → "Q1,250.00" */
export const formatQ = (centavos: number) =>
  "Q" + (centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "+50255551234" → "5555 1234". Otros formatos se devuelven tal cual. */
export const formatTelefono = (e164: string) => {
  const m = /^\+502(\d{4})(\d{4})$/.exec(e164);
  return m ? `${m[1]} ${m[2]}` : e164;
};
