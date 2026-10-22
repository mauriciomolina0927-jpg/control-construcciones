// Reads a WhatsApp text message with Groq, on its free tier (about 1,000 requests a day per model).
// Same instructions and checks as Gemini; Groq is faster, but photos still go to Gemini.
import { contextText, DECISION_SCHEMA, SYSTEM } from "@/lib/whatsapp/gemini";
import type { Decision, WhatsappContext } from "@/lib/whatsapp/reader";

const API = "https://api.groq.com/openai/v1/chat/completions";
// GROQ_MODEL overrides these without a deploy of code; each model has its own free quota.
const DEFAULT_MODELS = "openai/gpt-oss-120b,openai/gpt-oss-20b";

/** Asks Groq what a text message means. Throws on any API error or limit; the caller tries the next reader. */
export async function interpretWithGroq(ctx: WhatsappContext, text: string, today: string): Promise<Decision> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing environment variable GROQ_API_KEY");
  const models = (process.env.GROQ_MODEL || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);

  const system = `${SYSTEM}\n\nAnswer only with a JSON object that follows this schema (OpenAPI style; "nullable" fields may be null):\n${JSON.stringify(DECISION_SCHEMA)}`;
  const user = `${contextText(ctx, today)}\n\nNew message:\n${text}`;

  const failures: string[] = [];
  for (const model of models) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        failures.push(`${model} ${response.status}: ${(await response.text()).slice(0, 150)}`);
        continue;
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        failures.push(`${model}: no content`);
        continue;
      }
      const decision = JSON.parse(content) as Decision;
      if (!Array.isArray(decision.expenses)) {
        failures.push(`${model}: unexpected shape`);
        continue;
      }
      return decision;
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.name : String(error)}`);
    }
  }
  throw new Error(`Groq failed on every model: ${failures.join(" | ")}`);
}
