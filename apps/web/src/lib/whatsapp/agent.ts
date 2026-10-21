import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/expenses";
import type { MediaType } from "@/lib/whatsapp/webhook";

/** What the database tells the agent about the person writing (public.whatsapp_context). */
export type WhatsappContext = {
  organization_id: string;
  partner_id: string;
  partner_name: string;
  partners: { id: string; name: string }[];
  houses: { id: string; name: string; stage: string; lot: number; construction: number; without_receipt: number }[];
  recent: { direction: "in" | "out"; body: string | null; has_media: boolean; at: string }[];
  open: { id: string; amount: number | null; house_id: string | null; category: string | null; supplier_name: string | null; missing: string[]; at: string }[];
};

export type ProposedExpense = {
  update_id: string | null;
  amount: number | null;
  house_id: string | null;
  category: string | null;
  supplier_name: string | null;
  description: string | null;
  spent_on: string | null;
  paid_by_partner_id: string | null;
};

export type Decision = {
  intent: "expenses" | "question" | "other";
  expenses: ProposedExpense[];
  answer: string | null;
};

const MODEL = "claude-opus-5-5";

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "expenses", "answer"],
  properties: {
    intent: { type: "string", enum: ["expenses", "question", "other"] },
    expenses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["update_id", "amount", "house_id", "category", "supplier_name", "description", "spent_on", "paid_by_partner_id"],
        properties: {
          update_id: nullable({ type: "string" }),
          amount: nullable({ type: "integer" }),
          house_id: nullable({ type: "string" }),
          category: nullable({ type: "string", enum: CATEGORIES.map((c) => c.name) }),
          supplier_name: nullable({ type: "string" }),
          description: nullable({ type: "string" }),
          spent_on: nullable({ type: "string" }),
          paid_by_partner_id: nullable({ type: "string" }),
        },
      },
    },
    answer: nullable({ type: "string" }),
  },
};

const SYSTEM = `You read WhatsApp messages that the partners of a small family construction business in Atlántico, Colombia send to the company number. They report what they spent on the houses they build, sometimes with a photo of the receipt, and sometimes ask how a house is going.

Your output is a proposal only. Nothing you return becomes a record until a person reviews it in the app, so never guess to fill a gap: leave a field null when the message and the receipt do not say it.

How to read amounts: Colombian pesos, whole numbers. "850 mil" or "850" for materials means 850000; "1,2 millones" or "1.2 palos" means 1200000; "400 al maestro" means 400000. Receipts use dots as thousands separators. When the text and the receipt disagree, prefer the receipt total and mention the difference in description.

Fields:
- house_id: one of the house ids given. If there is only one open house, use it. If there are several and the message does not say which, leave it null.
- category: exactly one of the given categories, or null.
- paid_by_partner_id: the partner who put the money in. Default to the person writing unless they say someone else paid.
- spent_on: YYYY-MM-DD only when the message or receipt states a date; otherwise null (the app uses the message date).
- description: a few words that help the reviewer, in Spanish (for example "quedó fiado", "anticipo"). Null if nothing to add.
- update_id: when the message answers a question we asked about an open suggestion (for example "1" after "¿Para cuál casa? 1. ... 2. ..."), return that suggestion's id here with the fields the answer fills, and leave the rest null. Otherwise null.

intent:
- "expenses": the message reports one or more expenses, or completes an open suggestion. One entry per expense.
- "question": the person asks about the business (how much a house has cost, what is missing). Write "answer" in short, warm Colombian Spanish using only the figures given; say you do not have it if it is not there.
- "other": greetings, thanks, anything else. "answer" is a one-line friendly reply in Spanish, mentioning they can send expenses with a photo of the receipt.
For "expenses", "answer" is null: the app writes the confirmation itself.`;

function contextText(ctx: WhatsappContext, today: string): string {
  const houses = ctx.houses
    .map((h) => `- ${h.name} (id ${h.id}, etapa ${h.stage}): lote $${h.lot}, obra $${h.construction}, gastos sin recibo ${h.without_receipt}`)
    .join("\n");
  const partners = ctx.partners.map((p) => `- ${p.name} (id ${p.id})`).join("\n");
  const recent = ctx.recent
    .map((m) => `[${m.at}] ${m.direction === "in" ? ctx.partner_name : "Constructora"}: ${m.body ?? ""}${m.has_media ? " [foto]" : ""}`)
    .join("\n");
  const open = ctx.open
    .map((s) => `- id ${s.id}: ${s.amount ?? "?"} pesos, casa ${s.house_id ?? "?"}, ${s.category ?? "?"}, falta ${s.missing.join(", ")}`)
    .join("\n");
  return [
    `Today in Colombia: ${today}. Writing: ${ctx.partner_name} (id ${ctx.partner_id}).`,
    `Open houses:\n${houses || "(none)"}`,
    `Partners:\n${partners}`,
    `Categories: ${CATEGORIES.map((c) => c.name).join("; ")}`,
    `Suggestions still missing data:\n${open || "(none)"}`,
    `Conversation in the last 24 hours, oldest first:\n${recent || "(none)"}`,
  ].join("\n\n");
}

/** Asks Claude what a message means. Throws on API errors; the caller answers the person with a fallback. */
export async function interpret(
  ctx: WhatsappContext,
  message: { text: string; media: { type: MediaType; base64: string } | null },
  today: string,
): Promise<Decision> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (message.media?.type === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: message.media.base64 } });
  } else if (message.media) {
    content.push({ type: "image", source: { type: "base64", media_type: message.media.type, data: message.media.base64 } });
  }
  content.push({ type: "text", text: `${contextText(ctx, today)}\n\nNew message:\n${message.text || "(only the attachment)"}` });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: DECISION_SCHEMA } },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`Claude stopped: ${response.stop_reason}`);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text");
  return JSON.parse(text.text) as Decision;
}
