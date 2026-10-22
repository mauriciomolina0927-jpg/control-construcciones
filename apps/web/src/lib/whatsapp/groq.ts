// Reads a WhatsApp message with Groq, on its free tier (about 1,000 requests a day per model).
// Same instructions and checks as Gemini. Texts come here first; photos only when Gemini fails (PDFs never).
import { contextText, DECISION_SCHEMA, SYSTEM } from "@/lib/whatsapp/gemini";
import type { Decision, WhatsappContext } from "@/lib/whatsapp/reader";
import type { MediaType } from "@/lib/whatsapp/webhook";

const API = "https://api.groq.com/openai/v1/chat/completions";
// GROQ_MODEL overrides these without a deploy of code; each model has its own free quota.
const DEFAULT_MODELS = "openai/gpt-oss-120b,openai/gpt-oss-20b";
// The free model that reads images (GROQ_VISION_MODEL overrides it).
const VISION_MODEL = "qwen/qwen3.8-27b";

/** Asks Groq what a message means. Throws on any API error or limit; the caller tries the next reader. */
export async function interpretWithGroq(
  ctx: WhatsappContext,
  message: { text: string; media: { type: MediaType; base64: string } | null },
  today: string,
): Promise<Decision> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing environment variable GROQ_API_KEY");
  if (message.media?.type === "application/pdf") throw new Error("Groq does not read PDFs");
  const image = message.media;
  const models = image
    ? [process.env.GROQ_VISION_MODEL || VISION_MODEL]
    : (process.env.GROQ_MODEL || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
  const text = message.text || "(only the attachment)";

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
            {
              role: "user",
              content: image
                ? [
                    { type: "text", text: user },
                    { type: "image_url", image_url: { url: `data:${image.type};base64,${image.base64}` } },
                  ]
                : user,
            },
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
