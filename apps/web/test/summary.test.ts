import { describe, expect, it } from "vitest";
import { bogotaGreeting, spentByMonth } from "../src/lib/expenses";
import { formatMillions } from "../src/lib/money";

describe("cifras resumidas", () => {
  it("muestra millones con un decimal", () => {
    expect(formatMillions(165_500_000n)).toBe("$ 165,5 M");
    expect(formatMillions(140_000_000n)).toBe("$ 140,0 M");
    expect(formatMillions(6_350_000n)).toBe("$ 6,4 M");
    expect(formatMillions(1_234_000_000n)).toBe("$ 1.234,0 M");
  });

  it("redondea a la décima más cercana", () => {
    expect(formatMillions(18_449_999n)).toBe("$ 18,4 M");
    expect(formatMillions(18_450_000n)).toBe("$ 18,5 M");
    expect(formatMillions(999_999_999n)).toBe("$ 1.000,0 M");
  });

  it("deja los montos pequeños completos y marca los negativos", () => {
    expect(formatMillions(850_000n).replace(/\s/g, " ")).toBe("$ 850.000");
    expect(formatMillions(-2_500_000n)).toBe("−$ 2,5 M");
  });
});

describe("gastos por mes", () => {
  it("suma por mes y cruza el cambio de año", () => {
    const months = spentByMonth(
      [
        { amount: 1_000n, spentOn: "2026-01-15" },
        { amount: 2_000n, spentOn: "2026-01-31" },
        { amount: 5_000n, spentOn: "2025-12-01" },
        { amount: 9_000n, spentOn: "2025-07-01" },
      ],
      "2026-01-20",
      3,
    );
    expect(months).toEqual([
      { key: "2025-11", label: "nov", total: 0n },
      { key: "2025-12", label: "dic", total: 5_000n },
      { key: "2026-01", label: "ene", total: 3_000n },
    ]);
  });
});

describe("saludo", () => {
  it("usa la hora de Colombia", () => {
    expect(bogotaGreeting(new Date("2026-10-21T13:00:00Z"))).toBe("Buenos días"); // 8 a. m.
    expect(bogotaGreeting(new Date("2026-10-21T19:30:00Z"))).toBe("Buenas tardes"); // 2:30 p. m.
    expect(bogotaGreeting(new Date("2026-10-22T02:00:00Z"))).toBe("Buenas noches"); // 9 p. m.
  });
});
