import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { bogotaToday, detectReceiptType, MAX_RECEIPT_BYTES } from "@/lib/expenses";
import { interpret, type WhatsappContext } from "@/lib/whatsapp/agent";
import { downloadMedia, sendText } from "@/lib/whatsapp/meta";
import { checkProposal, confirmationText } from "@/lib/whatsapp/proposal";
import { isKeptMedia, type IncomingMessage, type MediaType } from "@/lib/whatsapp/webhook";

const FALLBACK_REPLY =
  "Recibí tu mensaje, pero no lo pude leer bien. Mauricio lo revisa en la app. Si quieres, escríbelo así: valor, qué fue y para cuál casa.";

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

  const today = bogotaToday();
  let decision;
  try {
    decision = await interpret(ctx, { text: message.text, media }, today);
  } catch (error) {
    console.error("whatsapp interpret failed", error);
    // Keep the message in the inbox with nothing filled in, so it is not lost.
    await db.rpc("whatsapp_suggest", { token, message: messageId, suggestion: { missing: ["amount", "house_id", "category"] } });
    await reply(FALLBACK_REPLY);
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
