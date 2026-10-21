const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** "$ 87.500.000" */
export function formatPesos(amount: bigint): string {
  return cop.format(amount);
}

/** Money comes from the database as a JSON number (bigint columns stay far below 2^53). */
export function toPesos(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}

/** Parses what a person types: "850.000", "850000" or "$ 850.000". Returns null if it is not a whole amount. */
export function parsePesos(text: string): bigint | null {
  const digits = text.replace(/[$\s.]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return BigInt(digits);
}
