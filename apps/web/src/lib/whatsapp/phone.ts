/**
 * The number as WhatsApp sends it: country code and digits only. A Colombian cell phone typed
 * without the country code ("300 111 2233") gets 57. Returns null if it is not a phone number.
 */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  const full = digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
  return /^[1-9]\d{7,14}$/.test(full) ? full : null;
}

/** "573001112233" → "+57 300 111 2233" */
export function formatPhone(phone: string): string {
  const m = /^57(3\d{2})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${phone}`;
}
