import { createHmac, timingSafeEqual } from "node:crypto";

/** One message a person sent to the company number, already reduced to what the app uses. */
export type IncomingMessage = {
  id: string;
  from: string;
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
        messages?: {
          id?: string;
          from?: string;
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

/** The messages in a webhook call. Delivery receipts and anything without a sender are skipped. */
export function incomingMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of (payload as Payload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const base = { id: m.id, from: m.from.replace(/\D/g, ""), mediaId: null, mimeType: null };
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
