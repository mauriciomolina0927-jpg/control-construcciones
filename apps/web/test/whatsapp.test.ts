import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProposedExpense, WhatsappContext } from "../src/lib/whatsapp/reader";
import { formatPesos } from "../src/lib/money";
import { checkProposal, confirmationText } from "../src/lib/whatsapp/proposal";
import { incomingMessages, isSignatureValid } from "../src/lib/whatsapp/webhook";

const ctx: WhatsappContext = {
  organization_id: "org",
  partner_id: "miguel",
  partner_name: "Miguel",
  partners: [
    { id: "miguel", name: "Miguel" },
    { id: "jesus", name: "Jesús" },
  ],
  houses: [
    { id: "prado", name: "El Prado", stage: "construction", lot: 65000000, construction: 100500000, without_receipt: 2 },
    { id: "robles", name: "Los Robles", stage: "lot", lot: 40000000, construction: 0, without_receipt: 0 },
  ],
  recent: [],
  open: [],
};

const proposal = (p: Partial<ProposedExpense>): ProposedExpense => ({
  update_id: null,
  amount: null,
  house_id: null,
  category: null,
  supplier_name: null,
  description: null,
  spent_on: null,
  paid_by_partner_id: null,
  ...p,
});

describe("webhook signature", () => {
  const body = '{"entry":[]}';
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts Meta's signature and refuses anything else", () => {
    expect(isSignatureValid(body, sign("secreto"), "secreto")).toBe(true);
    expect(isSignatureValid(body, sign("otro"), "secreto")).toBe(false);
    expect(isSignatureValid(body, null, "secreto")).toBe(false);
    expect(isSignatureValid(body, "sha256=abc", "secreto")).toBe(false);
  });
});

describe("incoming messages", () => {
  it("reads text, photos with caption and button replies; skips delivery receipts", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "x", status: "delivered" }],
                messages: [
                  { id: "1", from: "573001112233", type: "text", text: { body: "Cemento 850 mil" } },
                  { id: "2", from: "573001112233", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "El Prado" } },
                  { id: "3", from: "573001112233", type: "interactive", interactive: { button_reply: { title: "El Prado" } } },
                  { id: "4", from: "573001112233", type: "audio" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(incomingMessages(payload)).toEqual([
      { id: "1", from: "573001112233", kind: "text", text: "Cemento 850 mil", mediaId: null, mimeType: null },
      { id: "2", from: "573001112233", kind: "image", text: "El Prado", mediaId: "m1", mimeType: "image/jpeg" },
      { id: "3", from: "573001112233", kind: "text", text: "El Prado", mediaId: null, mimeType: null },
      { id: "4", from: "573001112233", kind: "unsupported", text: "", mediaId: null, mimeType: null },
    ]);
    expect(incomingMessages({})).toEqual([]);
    expect(incomingMessages(null)).toEqual([]);
  });
});

describe("checking what the reader proposed", () => {
  const today = "2026-10-21";

  it("drops made-up houses, partners and categories, and impossible amounts or dates", () => {
    const { suggestion } = checkProposal(
      proposal({ amount: -5, house_id: "inventada", category: "Comida", paid_by_partner_id: "nadie", spent_on: "2026-12-01" }),
      ctx,
      today,
    );
    expect(suggestion).toMatchObject({ amount: null, house_id: null, category: null, paid_by_partner_id: null, spent_on: null });
    expect(suggestion.missing).toEqual(["amount", "house_id", "category"]);
  });

  it("keeps a complete expense and asks for nothing", () => {
    const checked = checkProposal(
      proposal({ amount: 850000, house_id: "prado", category: "Materiales", supplier_name: " Ferretería X ", description: "quedó fiado" }),
      ctx,
      today,
    );
    expect(checked.suggestion.missing).toEqual([]);
    expect(checked.suggestion.supplier_name).toBe("Ferretería X");
    expect(confirmationText(checked.merged, ctx)).toBe(
      [
        "Listo, Miguel. Lo dejé para revisar en la app:",
        "",
        `*${formatPesos(850000n)}* · Materiales`,
        "El Prado · Ferretería X",
        "Pagó: Miguel · quedó fiado",
        "",
        "Si algo está mal, escríbeme y lo corrijo.",
      ].join("\n"),
    );
  });

  it("asks which house when there are several and the message does not say", () => {
    const checked = checkProposal(proposal({ amount: 400000, category: "Mano de obra" }), ctx, today);
    expect(checked.suggestion.missing).toEqual(["house_id"]);
    expect(confirmationText(checked.merged, ctx)).toBe(`Anoté ${formatPesos(400000n)}. ¿Para cuál casa?\n1. El Prado\n2. Los Robles`);
  });

  it("assumes the only open house", () => {
    const one = { ...ctx, houses: [ctx.houses[0]!] };
    expect(checkProposal(proposal({ amount: 1, category: "Materiales" }), one, today).suggestion.house_id).toBe("prado");
  });

  it("fills in an open suggestion with the answer and keeps what it already had", () => {
    const open = { ...ctx, open: [{ id: "s1", amount: 400000, house_id: null, category: "Mano de obra", supplier_name: "maestro Jorge", missing: ["house_id"], at: "" }] };
    const checked = checkProposal(proposal({ update_id: "s1", house_id: "prado" }), open, today);
    expect(checked.updateId).toBe("s1");
    expect(checked.suggestion).toMatchObject({ amount: null, house_id: "prado", missing: [] });
    expect(checked.merged).toMatchObject({ amount: 400000, house_id: "prado", category: "Mano de obra", supplier_name: "maestro Jorge" });
  });

  it("ignores an update for a suggestion that is not open", () => {
    expect(checkProposal(proposal({ update_id: "otra", amount: 5000, house_id: "prado", category: "Materiales" }), ctx, today).updateId).toBeNull();
  });
});

describe("incomingMessages without from", () => {
  it("takes the phone from the contact when only from_user_id comes", () => {
    const payload = { entry: [{ changes: [{ value: {
      contacts: [{ wa_id: "573008051142", user_id: "CO.123" }],
      messages: [{ id: "wamid.1", from_user_id: "CO.123", type: "text", text: { body: "hola" } }],
    } }] }] };
    expect(incomingMessages(payload)).toEqual([
      { id: "wamid.1", from: "573008051142", kind: "text", text: "hola", mediaId: null, mimeType: null },
    ]);
  });
});
