// Reads a WhatsApp message with Gemini (Google), on its free tier. Anything it returns is checked against
// the database's own lists (proposal.ts) and still waits for a person in the app.
import { CATEGORIES } from "@/lib/expenses";
import type { Decision, WhatsappContext } from "@/lib/whatsapp/reader";
import { SOUL } from "@/lib/whatsapp/soul";
import type { MediaType } from "@/lib/whatsapp/webhook";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
// The free tier's model names change over time; GEMINI_MODEL overrides these without a deploy of code.
// Each model has its own free quota, so when one is busy (503) or out of quota (429) the next one is tried.
// Lite models first: the messages are simple and the free flash models are the most saturated.
const DEFAULT_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.6-flash";

const nullable = (schema: object) => ({ ...schema, nullable: true });

// Gemini's response schema (an OpenAPI subset: "nullable" instead of a null type).
export const DECISION_SCHEMA = {
  type: "object",
  required: ["intent", "expenses", "answer"],
  properties: {
    intent: { type: "string", enum: ["expenses", "question", "other"] },
    expenses: {
      type: "array",
      items: {
        type: "object",
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

export const SYSTEM = `${SOUL}

Technical rules:
You read WhatsApp messages that the partners of a small family construction business in Atlántico, Colombia send to the company number. They report what they spent on the houses they build, sometimes with a photo of the receipt, and sometimes ask how a house is going.

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
- "other": greetings, thanks, anything else. "answer" is a short reply in the voice above.
For "expenses", "answer" is null: the app writes the confirmation itself.`;

export function contextText(ctx: WhatsappContext, today: string): string {
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

/** Asks Gemini what a message means. Throws on any API error or limit; the caller falls back to the fixed rules. */
export async function interpretWithGemini(
  ctx: WhatsappContext,
  message: { text: string; media: { type: MediaType; base64: string } | null },
  today: string,
): Promise<Decision> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing environment variable GEMINI_API_KEY");
  const models = (process.env.GEMINI_MODEL || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);

  const parts: object[] = [];
  if (message.media) parts.push({ inline_data: { mime_type: message.media.type, data: message.media.base64 } });
  parts.push({ text: `${contextText(ctx, today)}\n\nNew message:\n${message.text || "(only the attachment)"}` });

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: DECISION_SCHEMA },
  });
  let response: Response | null = null;
  const failures: string[] = [];
  for (const model of models) {
    try {
      const attempt = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (attempt.ok) {
        response = attempt;
        break;
      }
      failures.push(`${model} ${attempt.status}: ${(await attempt.text()).slice(0, 150)}`);
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.name : String(error)}`);
    }
  }
  if (!response) throw new Error(`Gemini failed on every model: ${failures.join(" | ")}`);

  const data = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error(`Gemini stopped: ${candidate.finishReason}`);
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  const decision = JSON.parse(text) as Decision;
  if (!Array.isArray(decision.expenses)) throw new Error("Gemini returned an unexpected shape");
  return decision;
}
