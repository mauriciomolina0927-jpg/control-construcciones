import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * After the PIN is entered, a signed cookie unlocks the app for this user.
 * It expires after 15 minutes without use; the proxy extends it on every request.
 */
export const PIN_COOKIE = "cc_pin";
export const PIN_IDLE_MS = 15 * 60 * 1000;

export function signPinSession(userId: string, secret: string, now = Date.now()): string {
  const expiresAt = now + PIN_IDLE_MS;
  return `${userId}.${expiresAt}.${mac(`${userId}.${expiresAt}`, secret)}`;
}

export function isPinSessionValid(
  value: string | undefined,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [cookieUser, expiresAt, signature] = parts as [string, string, string];

  const expected = Buffer.from(mac(`${cookieUser}.${expiresAt}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  return cookieUser === userId && Number(expiresAt) > now;
}

export const pinCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: PIN_IDLE_MS / 1000,
};

function mac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}
