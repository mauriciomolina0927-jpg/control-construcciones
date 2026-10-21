import { CATEGORIES } from "@/lib/expenses";
import { formatPesos } from "@/lib/money";
import type { ProposedExpense, WhatsappContext } from "@/lib/whatsapp/agent";

/** The fields a suggestion needs before it can be confirmed. */
export type MissingField = "amount" | "house_id" | "category";

/** The payload for public.whatsapp_suggest, after checking what Claude proposed against the database's own lists. */
export type CheckedProposal = {
  updateId: string | null;
  suggestion: {
    amount: number | null;
    house_id: string | null;
    category: string | null;
    supplier_name: string | null;
    description: string | null;
    spent_on: string | null;
    paid_by_partner_id: string | null;
    missing: MissingField[];
  };
  /** The suggestion as it stands after this message, for the reply. */
  merged: SuggestionSummary;
};

export type SuggestionSummary = {
  amount: number | null;
  house_id: string | null;
  category: string | null;
  supplier_name: string | null;
  paid_by_partner_id: string | null;
  description: string | null;
  missing: MissingField[];
};

const MAX_AMOUNT = 10_000_000_000; // 10.000 millones: anything larger is a misread

/**
 * Keeps only values that exist: a house, partner or category Claude made up becomes null, and so
 * does an impossible amount or date. With a single open house, that house is assumed.
 */
export function checkProposal(p: ProposedExpense, ctx: WhatsappContext, today: string): CheckedProposal {
  const open = p.update_id ? ctx.open.find((s) => s.id === p.update_id) : undefined;
  const amount = Number.isSafeInteger(p.amount) && p.amount! > 0 && p.amount! <= MAX_AMOUNT ? p.amount : null;
  let houseId = ctx.houses.some((h) => h.id === p.house_id) ? p.house_id : null;
  if (!houseId && !open && ctx.houses.length === 1) houseId = ctx.houses[0]!.id;
  const category = CATEGORIES.some((c) => c.name === p.category) ? p.category : null;
  const payer = ctx.partners.some((x) => x.id === p.paid_by_partner_id) ? p.paid_by_partner_id : null;
  const spentOn = p.spent_on && /^\d{4}-\d{2}-\d{2}$/.test(p.spent_on) && p.spent_on <= today ? p.spent_on : null;

  const final = {
    amount: amount ?? open?.amount ?? null,
    house_id: houseId ?? open?.house_id ?? null,
    category: category ?? open?.category ?? null,
  };
  const missing = (["amount", "house_id", "category"] as const).filter((f) => final[f] === null);
  const supplier = p.supplier_name?.trim() || null;
  const description = p.description?.trim() || null;

  return {
    merged: {
      ...final,
      supplier_name: supplier ?? open?.supplier_name ?? null,
      paid_by_partner_id: payer ?? ctx.partner_id,
      description,
      missing,
    },
    updateId: open?.id ?? null,
    suggestion: {
      amount,
      house_id: houseId,
      category,
      supplier_name: supplier,
      description,
      spent_on: spentOn,
      paid_by_partner_id: payer,
      missing,
    },
  };
}

/** What the person reads back on WhatsApp after a suggestion is saved. Never says it was registered: only proposed. */
export function confirmationText(saved: SuggestionSummary, ctx: WhatsappContext): string {
  const house = ctx.houses.find((h) => h.id === saved.house_id)?.name;
  const payer = ctx.partners.find((p) => p.id === saved.paid_by_partner_id)?.name ?? ctx.partner_name;

  if (saved.missing.includes("amount")) return "¿Cuánto fue? Escríbeme el valor en pesos.";
  if (saved.missing.includes("house_id")) {
    const options = ctx.houses.map((h, i) => `${i + 1}. ${h.name}`).join("\n");
    return `${saved.amount ? `Anoté ${formatPesos(BigInt(saved.amount))}. ` : ""}¿Para cuál casa?\n${options}`;
  }
  if (saved.missing.includes("category")) {
    return `¿Qué fue? Por ejemplo: materiales, mano de obra, transporte o herramientas.`;
  }

  const detail = [house ? `Casa ${house}` : null, saved.supplier_name].filter(Boolean).join(" · ");
  return [
    `Listo, ${ctx.partner_name}. Lo dejé para revisar en la app:`,
    "",
    `*${formatPesos(BigInt(saved.amount!))}* · ${saved.category}`,
    ...(detail ? [detail] : []),
    `Pagó: ${payer}${saved.description ? ` · ${saved.description}` : ""}`,
    "",
    "Si algo está mal, escríbeme y lo corrijo.",
  ].join("\n");
}
