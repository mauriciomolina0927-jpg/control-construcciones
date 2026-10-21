import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canRegisterMovement,
  settle,
  type Expense,
  type Partner,
  type PartnerTransfer,
  type Peso,
  type SalePayment,
} from "../src";

// Cases approved in Fase 1 (docs: "Fase 1 · Especificación", section 6).
// Amounts in the spec are in millions of pesos; here everything is in pesos.

const M = (millions: number): Peso => BigInt(Math.round(millions * 1_000_000));

const SOCIO = "socio";
const PAPA = "papa";
const partners: Partner[] = [
  { id: SOCIO, name: "Socio", profitShareBps: 5_000 },
  { id: PAPA, name: "Papá", profitShareBps: 5_000 },
];

let seq = 0;
const expense = (
  amount: Peso,
  kind: Expense["kind"],
  paidBy: string,
  status: Expense["status"] = "active",
): Expense => ({ id: `e${++seq}`, amount, kind, paidBy, status });

const payment = (amount: Peso, receivedBy = PAPA): SalePayment => ({
  id: `p${++seq}`,
  amount,
  date: "2026-10-21",
  receivedBy,
  status: "active",
});

const transfer = (from: string, to: string, amount: Peso): PartnerTransfer => ({
  id: `t${++seq}`,
  from,
  to,
  amount,
});

/** Lote 60 del socio, construcción 100 del papá. */
const baseExpenses = (): Expense[] => [
  expense(M(60), "lot", SOCIO),
  expense(M(100), "construction", PAPA),
];

const entitled = (s: ReturnType<typeof settle>) =>
  Object.fromEntries(s.partners.map((p) => [p.partnerId, p.entitled]));

describe("liquidación de una casa", () => {
  it("1. ejemplo de Mauricio: ingreso neto 215 → socio 87,5 y papá 127,5", () => {
    const s = settle({ partners, expenses: baseExpenses(), payments: [payment(M(215))] });
    expect(s.totalCapital).toBe(M(160));
    expect(s.totalProfit).toBe(M(55));
    expect(entitled(s)).toEqual({ [SOCIO]: M(87.5), [PAPA]: M(127.5) });
  });

  it("2. pagos parciales de 80, 100 y 35: capital primero, luego utilidad", () => {
    const expenses = baseExpenses();
    const payments: SalePayment[] = [];
    const after = (amount: number) => {
      payments.push(payment(M(amount)));
      return entitled(settle({ partners, expenses, payments }));
    };
    expect(after(80)).toEqual({ [SOCIO]: M(30), [PAPA]: M(50) });
    expect(after(100)).toEqual({ [SOCIO]: M(70), [PAPA]: M(110) });
    expect(after(35)).toEqual({ [SOCIO]: M(87.5), [PAPA]: M(127.5) });
  });

  it("3. ingreso neto igual al capital: cada uno recupera lo suyo, sin utilidad", () => {
    const s = settle({ partners, expenses: baseExpenses(), payments: [payment(M(160))] });
    expect(s.totalProfit).toBe(0n);
    expect(s.capitalRecovered).toBe(true);
    expect(entitled(s)).toEqual({ [SOCIO]: M(60), [PAPA]: M(100) });
  });

  it("4. pérdida: ingreso neto 120 se reparte en proporción al aporte", () => {
    const s = settle({ partners, expenses: baseExpenses(), payments: [payment(M(120))] });
    expect(s.capitalRecovered).toBe(false);
    expect(entitled(s)).toEqual({ [SOCIO]: M(45), [PAPA]: M(75) });
  });

  it("5. gastos de venta: la comisión se devuelve primero a quien la pagó", () => {
    const expenses = [...baseExpenses(), expense(M(10), "sale_cost", PAPA)];
    const s = settle({ partners, expenses, payments: [payment(M(225))] });
    expect(s.netReceived).toBe(M(215));
    expect(entitled(s)).toEqual({ [SOCIO]: M(87.5), [PAPA]: M(137.5) });
  });

  it("6. gasto del lote pagado por el papá suma al aporte del papá", () => {
    const expenses = [...baseExpenses(), expense(M(4), "lot", PAPA)];
    const s = settle({ partners, expenses, payments: [payment(M(215))] });
    expect(s.totalCapital).toBe(M(164));
    expect(entitled(s)).toEqual({ [SOCIO]: M(85.5), [PAPA]: M(129.5) });
  });

  it("7. desistimiento: abono de 30 y devolución de 25", () => {
    const s = settle({
      partners,
      expenses: baseExpenses(),
      payments: [payment(M(30)), payment(-M(25))],
    });
    expect(s.received).toBe(M(5));
    expect(entitled(s)).toEqual({ [SOCIO]: M(1.875), [PAPA]: M(3.125) });
  });

  it("8. redondeo: el peso sobrante va al socio con mayor aporte", () => {
    const s = settle({ partners, expenses: baseExpenses(), payments: [payment(215_000_001n)] });
    expect(entitled(s)).toEqual({ [SOCIO]: 87_500_000n, [PAPA]: 127_500_001n });
  });

  it("9. un gasto anulado no cuenta; su reemplazo sí", () => {
    const expenses = [
      ...baseExpenses(),
      expense(M(5), "construction", PAPA, "voided"),
      expense(M(3), "construction", PAPA),
    ];
    const s = settle({ partners, expenses, payments: [] });
    const papa = s.partners.find((p) => p.partnerId === PAPA)!;
    expect(papa.contributed).toBe(M(103));
  });

  it("10. una casa liquidada no acepta movimientos nuevos", () => {
    expect(canRegisterMovement("settled")).toBe(false);
    expect(canRegisterMovement("sold")).toBe(true);
    expect(canRegisterMovement("construction")).toBe(true);
  });

  it("11. saldo entre socios: el papá recibe los 215 y luego transfiere 87,5", () => {
    const expenses = baseExpenses();
    const payments = [payment(M(215), PAPA)];
    const balance = (transfers: PartnerTransfer[]) =>
      Object.fromEntries(
        settle({ partners, expenses, payments, transfers }).partners.map((p) => [p.partnerId, p.balance]),
      );

    expect(balance([])).toEqual({ [SOCIO]: M(87.5), [PAPA]: -M(87.5) });
    expect(balance([transfer(PAPA, SOCIO, M(87.5))])).toEqual({ [SOCIO]: 0n, [PAPA]: 0n });
  });

  it("13. ejemplo de Mauricio: lote 65, construcción 75, venta 180 → 85 y 95", () => {
    const s = settle({
      partners,
      expenses: [expense(M(65), "lot", SOCIO), expense(M(75), "construction", PAPA)],
      payments: [payment(M(180))],
    });
    expect(s.totalProfit).toBe(M(40));
    expect(entitled(s)).toEqual({ [SOCIO]: M(85), [PAPA]: M(95) });
  });
});

describe("12. propiedades con 1.000 combinaciones al azar", () => {
  const peso = (max: number) => fc.bigInt({ min: 1n, max: BigInt(max) });
  const scenario = fc.record({
    lot: peso(500_000_000),
    construction: fc.array(peso(200_000_000), { minLength: 1, maxLength: 6 }),
    socioPays: fc.array(peso(50_000_000), { maxLength: 3 }),
    saleCosts: fc.array(fc.tuple(peso(20_000_000), fc.boolean()), { maxLength: 3 }),
    payments: fc.array(fc.tuple(fc.bigInt({ min: -50_000_000n, max: 900_000_000n }), fc.boolean()), {
      maxLength: 6,
    }),
  });

  it("lo asignado suma exacto lo recibido y nadie gana utilidad antes de recuperar su capital", () => {
    fc.assert(
      fc.property(scenario, (sc) => {
        const expenses: Expense[] = [
          expense(sc.lot, "lot", SOCIO),
          ...sc.construction.map((a) => expense(a, "construction", PAPA)),
          ...sc.socioPays.map((a) => expense(a, "construction", SOCIO)),
          ...sc.saleCosts.map(([a, bySocio]) => expense(a, "sale_cost", bySocio ? SOCIO : PAPA)),
        ];
        const payments = sc.payments.map(([a, toSocio]) => payment(a, toSocio ? SOCIO : PAPA));
        const s = settle({ partners, expenses, payments });

        const totalEntitled = s.partners.reduce((a, p) => a + p.entitled, 0n);
        const available = s.received > 0n ? s.received : 0n;
        expect(totalEntitled).toBe(available);

        const totalBalance = s.partners.reduce((a, p) => a + p.balance, 0n);
        expect(totalBalance).toBe(totalEntitled - s.received);

        for (const p of s.partners) {
          expect(p.capitalReturned <= p.contributed).toBe(true);
          expect(p.saleCostsReimbursed <= p.saleCostsPaid).toBe(true);
          if (!s.capitalRecovered) expect(p.profit).toBe(0n);
          if (s.capitalRecovered) expect(p.capitalReturned).toBe(p.contributed);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
