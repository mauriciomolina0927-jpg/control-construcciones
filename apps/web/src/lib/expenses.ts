export type ExpenseKind = "lot" | "construction" | "sale_cost";

/** The fixed list of categories. Each one decides how the settlement treats the expense. */
export const CATEGORIES: { name: string; kind: ExpenseKind }[] = [
  { name: "Materiales", kind: "construction" },
  { name: "Mano de obra", kind: "construction" },
  { name: "Herramientas y equipos", kind: "construction" },
  { name: "Transporte y acarreos", kind: "construction" },
  { name: "Servicios públicos", kind: "construction" },
  { name: "Diseño, planos y licencias", kind: "construction" },
  { name: "Otros de obra", kind: "construction" },
  { name: "Compra del lote", kind: "lot" },
  { name: "Escrituras e impuestos del lote", kind: "lot" },
  { name: "Comisión de venta", kind: "sale_cost" },
  { name: "Notaría y registro de la venta", kind: "sale_cost" },
  { name: "Otros de la venta", kind: "sale_cost" },
];

export const KIND_LABELS: Record<ExpenseKind, string> = {
  lot: "Lote",
  construction: "Obra",
  sale_cost: "Gasto de venta",
};

export function kindOf(category: string): ExpenseKind | null {
  return CATEGORIES.find((c) => c.name === category)?.kind ?? null;
}

/** Today's date in Colombia, as YYYY-MM-DD. */
export function bogotaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

/** "Buenos días", "Buenas tardes" or "Buenas noches" by the hour in Colombia. */
export function bogotaGreeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Who paid the last expense, so the next one starts with the same person. */
export const LAST_PAYER_COOKIE = "cc_last_payer";

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export type ReceiptType = { mime: string; extension: string };

/** Recognizes a receipt by its first bytes, never by the name or type the browser claims. */
export function detectReceiptType(bytes: Uint8Array): ReceiptType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { mime: "image/png", extension: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", extension: "pdf" };
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "heif"].includes(ascii(8, 12))) {
    return { mime: "image/heic", extension: "heic" };
  }
  return null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** The last `count` months up to the one of `today` (YYYY-MM-DD), oldest first, with what was spent in each. */
export function spentByMonth(
  expenses: { amount: bigint; spentOn: string }[],
  today: string,
  count = 6,
): { key: string; label: string; total: bigint }[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const months: { key: string; label: string; total: bigint }[] = [];
  for (let i = 0; i < count; i++) {
    months.unshift({ key: `${year}-${String(month).padStart(2, "0")}`, label: MONTHS[month - 1]!, total: 0n });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const e of expenses) {
    const m = byKey.get(e.spentOn.slice(0, 7));
    if (m) m.total += e.amount;
  }
  return months;
}
