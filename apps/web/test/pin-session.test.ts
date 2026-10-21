import { describe, expect, it } from "vitest";
import { isPinSessionValid, PIN_IDLE_MS, signPinSession } from "../src/lib/pin-session";

const SECRET = "a-test-secret-that-is-long-enough-123";
const USER = "00000000-0000-0000-0000-0000000000b1";

describe("sesión del PIN", () => {
  it("abre la app para el mismo usuario antes de 15 minutos", () => {
    const now = 1_000_000;
    const cookie = signPinSession(USER, SECRET, now);
    expect(isPinSessionValid(cookie, USER, SECRET, now + PIN_IDLE_MS - 1)).toBe(true);
  });

  it("vence después de 15 minutos sin uso", () => {
    const now = 1_000_000;
    const cookie = signPinSession(USER, SECRET, now);
    expect(isPinSessionValid(cookie, USER, SECRET, now + PIN_IDLE_MS)).toBe(false);
  });

  it("no sirve para otro usuario", () => {
    const cookie = signPinSession(USER, SECRET);
    expect(isPinSessionValid(cookie, "00000000-0000-0000-0000-0000000000c1", SECRET)).toBe(false);
  });

  it("rechaza una cookie alterada o firmada con otra clave", () => {
    const cookie = signPinSession(USER, SECRET);
    const [user, , signature] = cookie.split(".");
    expect(isPinSessionValid(`${user}.${Date.now() + 10 * PIN_IDLE_MS}.${signature}`, USER, SECRET)).toBe(false);
    expect(isPinSessionValid(signPinSession(USER, "otra-clave-distinta-de-al-menos-32-caracteres"), USER, SECRET)).toBe(false);
    expect(isPinSessionValid(undefined, USER, SECRET)).toBe(false);
    expect(isPinSessionValid("basura", USER, SECRET)).toBe(false);
  });
});
