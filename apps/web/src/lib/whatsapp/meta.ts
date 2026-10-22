// The WhatsApp Cloud API (Meta): download what a person sent and write back to them.

const GRAPH = "https://graph.facebook.com/v23.0";

function token(): string {
  const value = process.env.WHATSAPP_TOKEN;
  if (!value) throw new Error("Missing environment variable WHATSAPP_TOKEN");
  return value;
}

/** Downloads a photo or document. Returns null if it is larger than maxBytes or the download fails. */
export async function downloadMedia(mediaId: string, maxBytes: number): Promise<Uint8Array | null> {
  const headers = { Authorization: `Bearer ${token()}` };
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers });
  if (!meta.ok) return null;
  const { url, file_size } = (await meta.json()) as { url?: string; file_size?: number };
  if (!url || (file_size ?? 0) > maxBytes) return null;

  const file = await fetch(url, { headers });
  if (!file.ok) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytes.byteLength > maxBytes ? null : bytes;
}

/** Sends a text message to a phone, or to a user id when the person's phone never came (Meta's "recipient").
 * Returns the WhatsApp id of the message sent, or null if it failed. */
export async function sendText(to: { phone: string } | { userId: string }, body: string): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Missing environment variable WHATSAPP_PHONE_NUMBER_ID");
  const response = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...("phone" in to ? { to: to.phone } : { recipient: to.userId }),
      type: "text", text: { body, preview_url: false },
    }),
  });
  if (!response.ok) {
    // Meta explains the failure in the body (expired token, missing permission, number not allowed).
    console.error("whatsapp send failed", response.status, await response.text());
    return null;
  }
  const data = (await response.json()) as { messages?: { id?: string }[] };
  return data.messages?.[0]?.id ?? null;
}
