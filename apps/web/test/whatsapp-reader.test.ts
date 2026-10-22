import { describe, expect, it } from "vitest";
import { interpret, readAmount, readCategory, readDate, readHouse, type WhatsappContext } from "../src/lib/whatsapp/reader";

const ctx: WhatsappContext = {
  organization_id: "org",
  partner_id: "miguel",
  partner_name: "Miguel",
  partners: [
    { id: "miguel", name: "Miguel" },
    { id: "jesus", name: "Jesús" },
  ],
  houses: [
    { id: "prado", name: "El Prado", stage: "construction", lot: 65000000, construction: 100500000, without_receipt: 2 },
    { id: "robles", name: "Los Robles", stage: "lot", lot: 40000000, construction: 0, without_receipt: 0 },
  ],
  recent: [],
  open: [],
};
const today = "2026-10-21";
const read = (text: string, c = ctx) => interpret(c, { text, media: null }, today);

describe("reading amounts the way people write them", () => {
  it.each([
    ["Cemento 850 mil", 850000],
    ["850mil de arena", 850000],
    ["1,2 millones al maestro", 1200000],
    ["1.5 millones", 1500000],
    ["2 palos la semana", 2000000],
    ["1 millón 200 mil", 1200000],
    ["50 lucas de flete", 50000],
    ["$850.000 ferretería", 850000],
    ["pagué 1.250.000", 1250000],
    ["400 al maestro", 400000],
    ["25 bultos de cemento 850 mil", 850000],
    ["320000 tubería", 320000],
  ])("%s → %i", (text, amount) => expect(readAmount(text)).toBe(amount));

  it("leaves it empty when it is not clear", () => {
    expect(readAmount("cemento para El Prado")).toBeNull();
    expect(readAmount("25 bultos y 3 varillas")).toBeNull();
    expect(readAmount("10 y 20")).toBeNull();
  });
});

describe("houses, categories and dates", () => {
  it("finds the house by its name with or without the article", () => {
    expect(readHouse("cemento pa el prado", ctx.houses)).toBe("prado");
    expect(readHouse("ROBLES", ctx.houses)).toBe("robles");
    expect(readHouse("para las dos casas: prado y robles", ctx.houses)).toBeNull();
  });

  it("picks the category from the first keyword", () => {
    expect(readCategory("Cemento gris")).toBe("Materiales");
    expect(readCategory("le di al maestro Jorge")).toBe("Mano de obra");
    expect(readCategory("volqueta de arena")).toBe("Transporte y acarreos");
    expect(readCategory("escritura del lote")).toBe("Escrituras e impuestos del lote");
    expect(readCategory("almuerzo")).toBeNull();
  });

  it("understands ayer, antier and short dates", () => {
    expect(readDate("ayer", today)).toBe("2026-10-20");
    expect(readDate("antier", today)).toBe("2026-10-19");
    expect(readDate("el 18/10", today)).toBe("2026-10-18");
    expect(readDate("hoy", today)).toBeNull();
  });
});

describe("what a whole message means", () => {
  it("one expense, with who paid and a note", () => {
    expect(read("850 mil cemento El Prado, quedó fiado, lo pagó Jesús")).toEqual({
      intent: "expenses",
      answer: null,
      expenses: [
        {
          update_id: null,
          amount: 850000,
          house_id: "prado",
          category: "Materiales",
          supplier_name: null,
          description: "quedó fiado",
          spent_on: null,
          paid_by_partner_id: "jesus",
        },
      ],
    });
  });

  it("one expense per line, sharing the house said once", () => {
    const d = read("El Prado:\n850 mil cemento\n400 al maestro");
    expect(d.expenses.map((e) => [e.amount, e.category, e.house_id])).toEqual([
      [850000, "Materiales", "prado"],
      [400000, "Mano de obra", "prado"],
    ]);
  });

  it("a photo alone is an expense to fill in", () => {
    const d = interpret(ctx, { text: "", media: { type: "image/jpeg", base64: "" } }, today);
    expect(d.intent).toBe("expenses");
    expect(d.expenses[0]!.amount).toBeNull();
  });

  it("answers the question we asked about the open suggestion", () => {
    const open = { id: "s1", amount: 400000, house_id: null, category: "Mano de obra", supplier_name: null, missing: ["house_id"], at: "" };
    const c = { ...ctx, open: [open] };
    expect(read("2", c).expenses[0]).toMatchObject({ update_id: "s1", house_id: "robles", amount: null });
    expect(read("el prado", c).expenses[0]).toMatchObject({ update_id: "s1", house_id: "prado" });
    // A new amount is a new expense, not the answer.
    expect(read("300 mil arena el prado", c).expenses[0]).toMatchObject({ update_id: null, amount: 300000 });
  });

  it("a bare number is the amount when that is what we asked", () => {
    const open = { id: "s1", amount: null, house_id: null, category: null, supplier_name: null, missing: ["amount", "house_id", "category"], at: "" };
    expect(read("850", { ...ctx, open: [open] }).expenses[0]).toMatchObject({ update_id: "s1", amount: 850000 });
  });

  it("answers how the houses are going, and helps with anything else", () => {
    const q = read("¿Cuánto llevamos?");
    expect(q.intent).toBe("question");
    expect(q.answer).toContain("El Prado");
    expect(read("gracias").answer).toBeNull();
    expect(read("hola").answer).toContain("850 mil cemento El Prado");
  });
});

describe("asking to void", () => {
  const withVoidable: WhatsappContext = {
    ...ctx,
    voidable: [
      { kind: "expense", id: "e1", amount: 850000, house_id: null, category: "Materiales", supplier_name: null, spent_on: today, at: "1" },
      { kind: "expense", id: "e2", amount: 80000, house_id: null, category: "Transporte y acarreos", supplier_name: null, spent_on: today, at: "2" },
    ],
  };

  it("points to the most recent one when they say the last", () => {
    const d = read("borra el último, estaba repetido", withVoidable);
    expect(d.intent).toBe("void");
    expect(d.void_ids).toEqual(["e2"]);
  });

  it("takes every expense of today", () => {
    expect(read("anula todos los gastos del día de hoy", withVoidable).void_ids).toEqual(["e1", "e2"]);
  });

  it("is never read as a new expense, even with an amount", () => {
    const d = read("anula el cemento de 850", withVoidable);
    expect(d.intent).toBe("void");
    expect(d.expenses).toHaveLength(0);
    expect(d.void_ids).toEqual([]);
  });
});
