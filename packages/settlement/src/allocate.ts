import type { Peso } from "./types";

/**
 * Splits `total` pesos among weights, exactly, using whole pesos.
 * Each share is rounded down; leftover pesos go one at a time by largest
 * fractional remainder, then by `tieBreak` (higher first), then by input order.
 */
export function allocate(
  total: Peso,
  weights: readonly Peso[],
  tieBreak: readonly Peso[] = weights,
): Peso[] {
  if (total < 0n) throw new RangeError("total must be >= 0");
  if (weights.some((w) => w < 0n)) throw new RangeError("weights must be >= 0");

  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (total === 0n) return weights.map(() => 0n);
    throw new RangeError("cannot allocate a positive total over zero weights");
  }

  const shares = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w) => (total * w) % sum);
  let leftover = total - shares.reduce((a, b) => a + b, 0n);

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const byRemainder = cmpDesc(remainders[a]!, remainders[b]!);
      if (byRemainder !== 0) return byRemainder;
      const byTie = cmpDesc(tieBreak[a] ?? 0n, tieBreak[b] ?? 0n);
      if (byTie !== 0) return byTie;
      return a - b;
    });

  for (const i of order) {
    if (leftover === 0n) break;
    if (weights[i] === 0n) continue;
    shares[i] = shares[i]! + 1n;
    leftover -= 1n;
  }
  return shares;
}

function cmpDesc(a: bigint, b: bigint): number {
  return a > b ? -1 : a < b ? 1 : 0;
}
