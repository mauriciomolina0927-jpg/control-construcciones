import { describe, expect, it } from "vitest";
import { formatPesos, parsePesos, toPesos } from "../src/lib/money";
import { equalShares } from "../src/lib/stages";

describe("pesos", () => {
  it("lee valores escritos como en Colombia", () => {
    expect(parsePesos("850.000")).toBe(850_000n);
    expect(parsePesos("$ 215.000.000")).toBe(215_000_000n);
    expect(parsePesos("850000")).toBe(850_000n);
  });

  it("rechaza centavos, negativos y texto", () => {
    expect(parsePesos("850.000,50")).toBeNull();
    expect(parsePesos("-5000")).toBeNull();
    expect(parsePesos("mil")).toBeNull();
    expect(parsePesos("")).toBeNull();
  });

  it("muestra pesos sin decimales y con puntos de miles", () => {
    expect(formatPesos(87_500_000n).replace(/\s/g, " ")).toBe("$ 87.500.000");
  });

  it("convierte lo que llega de la base de datos", () => {
    expect(toPesos(127500000)).toBe(127_500_000n);
    expect(toPesos(null)).toBe(0n);
  });
});

describe("reparto de utilidad", () => {
  it("dos socios: 50/50", () => {
    expect(equalShares(["a", "b"])).toEqual([
      { partner_id: "a", profit_share_bps: 5000 },
      { partner_id: "b", profit_share_bps: 5000 },
    ]);
  });

  it("tres socios: suma exacto 100 %", () => {
    const shares = equalShares(["a", "b", "c"]);
    expect(shares.reduce((s, p) => s + p.profit_share_bps, 0)).toBe(10000);
    expect(shares[0]!.profit_share_bps).toBe(3334);
  });
});
