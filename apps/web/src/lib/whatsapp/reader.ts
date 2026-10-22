// Reads a WhatsApp message with fixed rules, no AI: amounts, house names, categories by keyword
// and a few dates. Whatever it cannot read is left empty and asked back; a person always confirms in the app.
import { formatPesos } from "@/lib/money";
import type { MediaType } from "@/lib/whatsapp/webhook";

/** What the database tells the reader about the person writing (public.whatsapp_context). */
export type WhatsappContext = {
  organization_id: string;
  partner_id: string;
  partner_name: string;
  partners: { id: string; name: string }[];
  houses: { id: string; name: string; stage: string; lot: number; construction: number; without_receipt: number }[];
  recent: { direction: "in" | "out"; body: string | null; has_media: boolean; at: string }[];
  open: { id: string; amount: number | null; house_id: string | null; category: string | null; supplier_name: string | null; missing: string[]; at: string }[];
  /** Recent active expenses and pending suggestions, oldest first: what a partner may ask to void. */
  voidable?: Voidable[];
  /** The void request waiting for a "sí", if any (30 minutes). */
  void_request?: { id: string; kind: "expense" | "suggestion"; target_id: string } | null;
};

export type Voidable = {
  kind: "expense" | "suggestion";
  id: string;
  amount: number | null;
  house_id: string | null;
  category: string | null;
  supplier_name: string | null;
  spent_on: string | null;
  at: string;
};

export type ProposedExpense = {
  update_id: string | null;
  amount: number | null;
  house_id: string | null;
  category: string | null;
  supplier_name: string | null;
  description: string | null;
  spent_on: string | null;
  paid_by_partner_id: string | null;
};

export type Decision = {
  intent: "expenses" | "question" | "void" | "other";
  expenses: ProposedExpense[];
  answer: string | null;
  /** For intent "void": the id of one item in ctx.voidable, or null when it is not clear which. */
  void_id?: string | null;
  void_reason?: string | null;
};

export const HELP_TEXT =
  "Para anotar un gasto escríbeme el valor, qué fue y la casa. Por ejemplo: *850 mil cemento El Prado*. Si tienes la foto del recibo, mándala con ese mismo texto.";

/** Lowercase, without accents, so "Cemento", "cemento" and "cémento" read the same. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const toNumber = (digits: string) => Number(digits.replace(",", "."));

/**
 * The amount in a line of text, in whole pesos, or null if there is none or it is ambiguous.
 * Understands "850 mil", "1,2 millones", "2 palos", "50 lucas", "$850.000", "1 millón 200 mil" and a bare
 * "400" (read as thousands, the way people write it). Quantities like "25 bultos" or "50 kg" are not amounts.
 */
export function readAmount(line: string): number | null {
  const text = normalize(line);
  const millionsAndThousands = /(\d+)\s*(?:millones|millon|palos?)\s*(?:y\s*)?(\d{1,3})\s*(?:mil|lucas?)\b/.exec(text);
  if (millionsAndThousands) return Number(millionsAndThousands[1]) * 1_000_000 + Number(millionsAndThousands[2]) * 1_000;

  const millions = /(\d+(?:[.,]\d+)?)\s*(?:millones|millon|palos?)\b/.exec(text);
  if (millions) return Math.round(toNumber(millions[1]!) * 1_000_000);
  const thousands = /(\d+(?:[.,]\d+)?)\s*(?:mil|lucas?|k)\b/.exec(text);
  if (thousands) return Math.round(toNumber(thousands[1]!) * 1_000);
  const separated = /(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{3})+)(?![\d.,])/.exec(text);
  if (separated) return Number(separated[1]!.replace(/[.,]/g, ""));

  // Bare numbers, skipping quantities, sizes and dates.
  const bare = [...text.matchAll(/(?<![\d/.,])(\d+)(?![\d/.,])\s*(kg|kilos?|bultos?|m2|mts?|metros?|unidades|und|uds?|x|pulgadas?|cm|galon(?:es)?|viajes?|dias?|semanas?|varillas?|tejas?|ladrillos?|bloques?|tubos?|sacos?|latas?|cajas?|rollos?|laminas?|cunetes?|tanques?|puertas?|ventanas?)?/g)]
    .filter((m) => !m[2])
    .map((m) => Number(m[1]));
  if (bare.length !== 1) return null;
  const value = bare[0]!;
  if (value >= 1_000) return value;
  return value > 0 ? value * 1_000 : null;
}

// The first keyword found in the text wins, so "volqueta de arena" is transport and "arena" alone is materials.
const CATEGORY_WORDS: [string, string[]][] = [
  ["Materiales", ["cemento", "arena", "varilla", "hierro", "ladrillo", "bloque", "teja", "pintura", "tuberia", "tubo", "cable", "ferreteria", "deposito", "material", "piso", "ceramica", "baldosa", "grava", "triturado", "alambre", "madera", "puerta", "ventana", "griferia", "sanitario", "pegante", "estuco", "yeso", "drywall", "concreto", "malla", "zinc"]],
  ["Mano de obra", ["maestro", "obrero", "ayudante", "oficial", "jornal", "mano de obra", "contratista", "albanil", "electricista", "plomero", "soldador", "pintor", "trabajador", "nomina", "quincena"]],
  ["Herramientas y equipos", ["herramienta", "alquiler", "mezcladora", "andamio", "taladro", "pulidora", "equipo", "formaleta", "carretilla"]],
  ["Transporte y acarreos", ["transporte", "flete", "acarreo", "volqueta", "camion", "acarreos", "mototaxi", "carreta"]],
  ["Servicios públicos", ["servicio", "agua", "luz", "energia", "acueducto", "gas", "air-e", "triple a"]],
  ["Diseño, planos y licencias", ["plano", "licencia", "curaduria", "arquitecto", "diseno", "ingeniero", "calculo", "topografia", "permiso"]],
  ["Escrituras e impuestos del lote", ["escritura", "predial", "impuesto", "boleta fiscal", "certificado de libertad"]],
  ["Compra del lote", ["lote"]],
  ["Comisión de venta", ["comision", "corredor", "inmobiliaria"]],
  ["Notaría y registro de la venta", ["notaria", "registro"]],
];

/** The category whose keyword appears first in the text, or null. */
export function readCategory(line: string): string | null {
  const text = normalize(line);
  let best: { category: string; at: number } | null = null;
  for (const [category, words] of CATEGORY_WORDS) {
    for (const word of words) {
      const at = text.search(new RegExp(`\\b${word}`));
      if (at >= 0 && (!best || at < best.at)) best = { category, at };
    }
  }
  return best?.category ?? null;
}

/** The house named in the text ("El Prado", "prado", "casa del prado"), or null if none or more than one. */
export function readHouse(line: string, houses: WhatsappContext["houses"]): string | null {
  const text = normalize(line);
  const found = houses.filter((h) => {
    const name = normalize(h.name).replace(/^(casa|la|el|los|las)\s+/, "");
    return name.length > 0 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  });
  return found.length === 1 ? found[0]!.id : null;
}

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** "ayer", "antier" or a date like 18/10 or 18/10/2026. Null means the day the message arrived. */
export function readDate(line: string, today: string): string | null {
  const text = normalize(line);
  if (/\b(antier|anteayer)\b/.test(text)) return addDays(today, -2);
  if (/\bayer\b/.test(text)) return addDays(today, -1);
  const m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4);
  const date = `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(date)) ? null : date;
}

/** Another partner who paid ("lo pagó Jesús"); null means the person writing. */
function readPayer(line: string, ctx: WhatsappContext): string | null {
  const text = normalize(line);
  if (!/\bpag/.test(text)) return null;
  const named = ctx.partners.filter((p) => new RegExp(`\\b${normalize(p.name).split(" ")[0]}\\b`).test(text));
  return named.length === 1 ? named[0]!.id : null;
}

function readNote(line: string): string | null {
  const text = normalize(line);
  const notes = [/\bfiad/.test(text) && "quedó fiado", /\banticipo\b/.test(text) && "anticipo", /\babono\b/.test(text) && "abono"];
  return notes.filter(Boolean).join(" · ") || null;
}

function readLine(line: string, ctx: WhatsappContext, today: string): ProposedExpense {
  return {
    update_id: null,
    amount: readAmount(line),
    house_id: readHouse(line, ctx.houses),
    category: readCategory(line),
    supplier_name: null,
    description: readNote(line),
    spent_on: readDate(line, today),
    paid_by_partner_id: readPayer(line, ctx),
  };
}

function summary(ctx: WhatsappContext): string {
  if (ctx.houses.length === 0) return "No hay casas abiertas en este momento.";
  const lines = ctx.houses.map((h) => {
    const total = formatPesos(BigInt(h.lot + h.construction));
    const pending = h.without_receipt > 0 ? ` · ${h.without_receipt} sin recibo` : "";
    return `*${h.name}*: ${total} (lote ${formatPesos(BigInt(h.lot))}, obra ${formatPesos(BigInt(h.construction))})${pending}`;
  });
  return ["Así van las casas, con los gastos ya confirmados:", ...lines].join("\n");
}

/**
 * Decides what a message means:
 * - an answer that fills in the suggestion we just asked about ("2", "El Prado", "850 mil", "materiales");
 * - one expense per line that has an amount (a photo counts as an expense even without text);
 * - a question about how the houses are going;
 * - anything else gets the short help.
 */
export function interpret(
  ctx: WhatsappContext,
  message: { text: string; media: { type: MediaType; base64: string } | null },
  today: string,
): Decision {
  const text = message.text.trim();
  const plain = normalize(text);
  if (/\b(anula|anular|anulalo|borra|borrar|borralo|elimina|eliminar|quita|quitalo)\b/.test(plain)) {
    // The fixed rules only understand "the last one"; anything more specific is asked back.
    const last = /\bultim/.test(plain) ? ctx.voidable?.at(-1) : undefined;
    return { intent: "void", expenses: [], answer: null, void_id: last?.id ?? null, void_reason: null };
  }
  const latest = ctx.open.at(-1);

  if (latest && !message.media) {
    const choice = /^\s*(\d{1,2})\s*\.?\s*$/.exec(plain);
    const fill = readLine(text, ctx, today);
    if (choice && latest.missing.includes("house_id") && !latest.missing.includes("amount")) {
      const house = ctx.houses[Number(choice[1]) - 1];
      if (house) return { intent: "expenses", expenses: [{ ...fill, amount: null, house_id: house.id, update_id: latest.id }], answer: null };
    }
    const fillsGap =
      (latest.missing.includes("amount") && fill.amount !== null) ||
      (latest.missing.includes("house_id") && fill.house_id !== null) ||
      (latest.missing.includes("category") && fill.category !== null);
    // A new amount when the open one already has its amount is a new expense, not an answer.
    const isNewExpense = fill.amount !== null && !latest.missing.includes("amount");
    if (fillsGap && !isNewExpense) {
      return { intent: "expenses", expenses: [{ ...fill, update_id: latest.id }], answer: null };
    }
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const expenses = lines.map((l) => readLine(l, ctx, today)).filter((e) => e.amount !== null);
  if (expenses.length > 1) {
    // A house, date or payer said once applies to every line that does not say its own.
    const whole = readLine(text, ctx, today);
    return {
      intent: "expenses",
      expenses: expenses.map((e) => ({
        ...e,
        house_id: e.house_id ?? whole.house_id,
        spent_on: e.spent_on ?? whole.spent_on,
        paid_by_partner_id: e.paid_by_partner_id ?? whole.paid_by_partner_id,
      })),
      answer: null,
    };
  }
  if (expenses.length === 1 || message.media) {
    return { intent: "expenses", expenses: [readLine(text, ctx, today)], answer: null };
  }

  if (/\b(cuanto|como va|como vamos|llevamos|resumen|gastado)\b/.test(plain)) {
    return { intent: "question", expenses: [], answer: summary(ctx) };
  }
  if (/\b(gracias|listo|ok|dale|bueno|perfecto)\b/.test(plain) && plain.length < 40) {
    return { intent: "other", expenses: [], answer: null };
  }
  return { intent: "other", expenses: [], answer: `Hola, ${ctx.partner_name}. ${HELP_TEXT}` };
}
