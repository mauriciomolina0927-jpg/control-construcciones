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

/** "$ 165,5 M" for a summary figure; amounts under a million keep every peso. Rounds half away from zero. */
export function formatMillions(amount: bigint): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (abs < 1_000_000n) return formatPesos(amount);
  const tenths = (abs + 50_000n) / 100_000n;
  const whole = (tenths / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "−" : ""}$ ${whole},${tenths % 10n} M`;
}
