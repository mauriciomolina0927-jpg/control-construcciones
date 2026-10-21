import { describe, expect, it } from "vitest";
import { bogotaToday, CATEGORIES, detectReceiptType, kindOf } from "../src/lib/expenses";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("receipts", () => {
  it("recognizes photos and PDFs by their content", () => {
    expect(detectReceiptType(bytes([0xff, 0xd8, 0xff, 0xe0])))?.toEqual({ mime: "image/jpeg", extension: "jpg" });
    expect(detectReceiptType(bytes([0x89], "PNG\r\n")))?.toMatchObject({ mime: "image/png" });
    expect(detectReceiptType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8")))?.toMatchObject({ mime: "image/webp" });
    expect(detectReceiptType(bytes("%PDF-1.7")))?.toMatchObject({ mime: "application/pdf" });
    expect(detectReceiptType(bytes([0, 0, 0, 24], "ftypheic")))?.toMatchObject({ mime: "image/heic" });
  });

  it("rejects anything else, whatever its name says", () => {
    expect(detectReceiptType(bytes("MZ\x90\x00"))).toBeNull();
    expect(detectReceiptType(bytes("<html>"))).toBeNull();
    expect(detectReceiptType(new Uint8Array())).toBeNull();
  });
});

describe("expenses", () => {
  it("every category maps to how the settlement treats it", () => {
    expect(kindOf("Compra del lote")).toBe("lot");
    expect(kindOf("Comisión de venta")).toBe("sale_cost");
    expect(kindOf("Materiales")).toBe("construction");
    expect(kindOf("Inventada")).toBeNull();
    expect(new Set(CATEGORIES.map((c) => c.name)).size).toBe(CATEGORIES.length);
  });

  it("uses Colombia's date, not the server's", () => {
    // 11 pm in Bogotá is already the next day in UTC.
    expect(bogotaToday(new Date("2026-10-22T04:00:00Z"))).toBe("2026-10-21");
  });
});
