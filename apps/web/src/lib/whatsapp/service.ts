import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { bogotaToday, detectReceiptType, MAX_RECEIPT_BYTES } from "@/lib/expenses";
import { interpretWithGemini } from "@/lib/whatsapp/gemini";
import { interpretWithGroq } from "@/lib/whatsapp/groq";
import { downloadMedia, sendText } from "@/lib/whatsapp/meta";
import { checkProposal, confirmationText } from "@/lib/whatsapp/proposal";
import { formatPesos } from "@/lib/money";
import { interpret, normalize, type Decision, type Voidable, type WhatsappContext } from "@/lib/whatsapp/reader";
import { isKeptMedia, type IncomingMessage, type MediaType } from "@/lib/whatsapp/webhook";

function webhookToken(): string {
  const value = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!value) throw new Error("Missing environment variable WHATSAPP_WEBHOOK_TOKEN");
  return value;
}

/**
 * The webhook has no signed-in user: it talks to the database only through the three
 * whatsapp_* functions, which check the webhook token and can only record and propose.
 */
function database() {
  return createClient(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Handles one incoming message from start to finish: record, read, propose, answer. Unknown phones are ignored. */
export async function handleMessage(message: IncomingMessage): Promise<void> {
  const db = database();
  const token = webhookToken();

  const { data: context, error: contextError } = await db.rpc("whatsapp_context", { token, phone: message.from });
  if (contextError) throw new Error(`whatsapp_context: ${contextError.message}`);
  if (!context) return;
  const ctx = context as WhatsappContext;

  let media: { type: MediaType; base64: string } | null = null;
  if (message.mediaId && isKeptMedia(message.mimeType)) {
    const bytes = await downloadMedia(message.mediaId, MAX_RECEIPT_BYTES);
    const type = bytes ? detectReceiptType(bytes) : null;
    if (bytes && type && isKeptMedia(type.mime)) media = { type: type.mime, base64: Buffer.from(bytes).toString("base64") };
  }

  const { data: messageId, error: recordError } = await db.rpc("whatsapp_record", {
    token,
    phone: message.from,
    wa_message_id: message.id,
    direction: "in",
    body: message.text,
    media_base64: media?.base64 ?? null,
    media_mime: media?.type ?? null,
  });
  if (recordError) throw new Error(`whatsapp_record: ${recordError.message}`);
  if (!messageId) return; // WhatsApp delivered it again; it was handled the first time.

  const reply = async (body: string) => {
    const sentId = await sendText(message.from, body);
    await db.rpc("whatsapp_record", { token, phone: message.from, wa_message_id: sentId, direction: "out", body });
  };

  if (message.kind === "unsupported" || (message.mediaId && !media && !message.text)) {
    await reply("Por ahora leo texto, fotos y PDF. Mándame el gasto escrito o la foto del recibo.");
    return;
  }

  // A "sí" right after "¿Anulo ...?" voids it; nothing else does.
  const lastOut = ctx.recent.filter((m) => m.direction === "out").at(-1);
  if (ctx.void_request && !media && lastOut?.body?.startsWith("¿Anulo") && isYes(message.text)) {
    const { data: done, error } = await db.rpc("whatsapp_confirm_void_many", { token, phone: message.from, request: ctx.void_request.id });
    if (error) throw new Error(`whatsapp_confirm_void_many: ${error.message}`);
    await reply(done
      ? `✅ Anulado${done > 1 ? `s ${done} gastos` : ""}. Ya no cuenta${done > 1 ? "n" : ""} en la casa; queda${done > 1 ? "n" : ""} en el historial de la app.`
      : "Eso ya no se puede anular (pasó la media hora o ya estaba anulado). Pídemelo otra vez.");
    return;
  }

  const today = bogotaToday();
  // Text goes to Groq first (fast, free) and then Gemini; photos go to Gemini first and Groq's image model
  // after it. If every model fails or hits its free limit, the fixed rules read the text.
  const groq: [string, () => Promise<Decision>] = ["groq", () => interpretWithGroq(ctx, { text: message.text, media }, today)];
  const gemini: [string, () => Promise<Decision>] = ["gemini", () => interpretWithGemini(ctx, { text: message.text, media }, today)];
  const readers = media ? [gemini, groq] : [groq, gemini];
  let decision: Decision | null = null;
  for (const [name, read] of readers) {
    try {
      decision = await read();
      console.log("whatsapp read by", name);
      break;
    } catch (error) {
      console.error(`whatsapp ${name} failed`, error);
    }
  }
  decision ??= interpret(ctx, { text: message.text, media }, today);

  if (decision.intent === "void") {
    const ids = new Set(decision.void_ids ?? []);
    const targets = (ctx.voidable ?? []).filter((v) => ids.has(v.id));
    if (targets.length === 0) {
      const last = (ctx.voidable ?? []).slice(-3).reverse();
      await reply(last.length
        ? `¿Cuál anulo? Dímelo con el valor o el día, o dime "todos los de hoy". Los últimos:\n${last.map((v) => `• ${describe(v, ctx)}`).join("\n")}`
        : "No veo gastos recientes para anular. Si es uno viejo, anúlalo en la app, en Dinero.");
      return;
    }
    const { data: requestId, error } = await db.rpc("whatsapp_request_void_many", {
      token, phone: message.from, targets: targets.map((v) => ({ kind: v.kind, id: v.id })), reason: decision.void_reason ?? null,
    });
    if (error) throw new Error(`whatsapp_request_void_many: ${error.message}`);
    if (!requestId) {
      await reply("Eso ya no se puede anular desde aquí. Revísalo en la app, en Dinero.");
      return;
    }
    const total = targets.reduce((sum, v) => sum + (v.amount ?? 0), 0);
    await reply(targets.length === 1
      ? `¿Anulo ${describe(targets[0]!, ctx)}? Responde *sí* para anularlo.`
      : `¿Anulo estos ${targets.length} gastos por *${formatPesos(BigInt(total))}* en total?\n${targets.map((v) => `• ${describe(v, ctx)}`).join("\n")}\nResponde *sí* para anularlos.`);
    return;
  }

  if (decision.intent !== "expenses" || decision.expenses.length === 0) {
    if (decision.answer) await reply(decision.answer);
    return;
  }

  const replies: string[] = [];
  for (const proposed of decision.expenses.slice(0, 10)) {
    const checked = checkProposal(proposed, ctx, today);
    const { error } = await db.rpc("whatsapp_suggest", {
      token,
      message: messageId,
      suggestion: checked.suggestion,
      update_id: checked.updateId,
    });
    if (error) throw new Error(`whatsapp_suggest: ${error.message}`);
    replies.push(confirmationText(checked.merged, ctx));
  }
  await reply(replies.join("\n\n"));
}

function isYes(text: string): boolean {
  return /^(si|sii+|sip|claro|dale|confirmo|hagale|hagalo|anulalo|ok|okay|de una)\b/.test(normalize(text.trim())) && text.length < 40;
}

/** "el flete de $80.000 (Casa 5, 2026-10-22)" — enough for the person to recognize it. */
function describe(v: Voidable, ctx: WhatsappContext): string {
  const what = v.supplier_name || v.category || (v.kind === "suggestion" ? "gasto sin confirmar" : "gasto");
  const amount = v.amount ? formatPesos(BigInt(v.amount)) : "sin valor";
  const house = ctx.houses.find((h) => h.id === v.house_id)?.name;
  return `${what} de *${amount}* (${[house, v.spent_on].filter(Boolean).join(", ")})`;
}
