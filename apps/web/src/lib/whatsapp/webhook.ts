import { createHmac, timingSafeEqual } from "node:crypto";

/** One message a person sent to the company number, already reduced to what the app uses. */
export type IncomingMessage = {
  id: string;
  /** The sender's phone, digits only; empty when Meta sent only a user id. */
  from: string;
  /** Meta's business-scoped user id (like "CO.123..."), when it came. */
  userId: string | null;
  kind: "text" | "image" | "document" | "unsupported";
  text: string;
  mediaId: string | null;
  mimeType: string | null;
};

/** Meta signs every webhook with the app secret: "sha256=<hex HMAC of the raw body>". */
export function isSignatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Payload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; user_id?: string }[];
        messages?: {
          id?: string;
          from?: string;
          from_user_id?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          document?: { id?: string; mime_type?: string; caption?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
          button?: { text?: string };
        }[];
      };
    }[];
  }[];
};

/** The messages in a webhook call. Delivery receipts and anything without a sender are skipped.
 * Some accounts come with from_user_id instead of from; then the phone is the matching contact's wa_id. */
export function incomingMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of (payload as Payload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const contacts = change.value?.contacts ?? [];
      for (const m of change.value?.messages ?? []) {
        const from =
          m.from ??
          contacts.find((c) => m.from_user_id && c.user_id === m.from_user_id)?.wa_id ??
          (contacts.length === 1 ? contacts[0].wa_id : undefined);
        const userId = m.from_user_id ?? null;
        if (!m.id || (!from && !userId)) continue;
        const base = { id: m.id, from: (from ?? "").replace(/\D/g, ""), userId, mediaId: null, mimeType: null };
        if (m.type === "text") {
          out.push({ ...base, kind: "text", text: m.text?.body ?? "" });
        } else if (m.type === "image" || m.type === "document") {
          const media = m.type === "image" ? m.image : m.document;
          out.push({
            ...base,
            kind: m.type,
            text: media?.caption ?? "",
            mediaId: media?.id ?? null,
            mimeType: media?.mime_type?.split(";")[0]?.trim() ?? null,
          });
        } else if (m.type === "interactive" || m.type === "button") {
          const title = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.button?.text ?? "";
          out.push({ ...base, kind: "text", text: title });
        } else {
          out.push({ ...base, kind: "unsupported", text: "" });
        }
      }
    }
  }
  return out;
}

/** Receipts the app keeps: the same types the receipts bucket accepts, minus HEIC (WhatsApp converts photos to JPEG). */
export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export function isKeptMedia(mime: string | null): mime is MediaType {
  return MEDIA_TYPES.includes(mime as MediaType);
}
