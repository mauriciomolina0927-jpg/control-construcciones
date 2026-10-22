import { after, type NextRequest } from "next/server";
import { handleMessage } from "@/lib/whatsapp/service";
import { incomingMessages, isSignatureValid } from "@/lib/whatsapp/webhook";

// Reading a message with a receipt photo can take a while; Meta only needs the quick 200.
export const maxDuration = 60;

/** Meta checks the webhook once when it is set up: echo the challenge if the verify token matches. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const raw = await request.text();
  if (!appSecret || !isSignatureValid(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Answer right away so Meta does not resend, and do the work after the response.
  after(async () => {
    const messages = incomingMessages(payload);
    if (messages.length === 0) console.log("whatsapp webhook without messages", describePayload(payload));
    for (const message of messages) {
      try {
        await handleMessage(message);
      } catch (error) {
        console.error("whatsapp message failed", message.id, error);
      }
    }
  });
  return new Response("OK", { status: 200 });
}

/** The shape of a webhook call, without its content: which field changed and which keys came. */
function describePayload(payload: unknown): string {
  type Change = { field?: string; value?: Record<string, unknown> & { messages?: Record<string, unknown>[]; statuses?: unknown[] } };
  const changes = ((payload as { entry?: { changes?: Change[] }[] })?.entry ?? []).flatMap((e) => e.changes ?? []);
  return JSON.stringify(changes.map((c) => ({
    field: c.field,
    value: Object.keys(c.value ?? {}),
    message: c.value?.messages?.[0] ? Object.keys(c.value.messages[0]) : undefined,
    type: c.value?.messages?.[0]?.type,
    statuses: c.value?.statuses?.length,
  })));
}
