import type { PartnerSettlement } from "@cc/settlement";

export type PaymentSource = "buyer" | "bank" | "subsidy" | "severance";

export const SOURCE_LABELS: Record<PaymentSource, string> = {
  buyer: "Comprador directo",
  bank: "Crédito bancario",
  subsidy: "Subsidio",
  severance: "Cesantías",
};

export type SuggestedTransfer = { from: string; to: string; amount: bigint };

/** Who should pass money to whom so every partner ends with what the rule gives them. */
export function suggestTransfers(partners: Pick<PartnerSettlement, "partnerId" | "balance">[]): SuggestedTransfer[] {
  const owes = partners.filter((p) => p.balance < 0n).map((p) => ({ id: p.partnerId, left: -p.balance }));
  const owed = partners.filter((p) => p.balance > 0n).map((p) => ({ id: p.partnerId, left: p.balance }));
  const transfers: SuggestedTransfer[] = [];
  for (const debtor of owes) {
    for (const creditor of owed) {
      if (debtor.left === 0n) break;
      const amount = debtor.left < creditor.left ? debtor.left : creditor.left;
      if (amount === 0n) continue;
      transfers.push({ from: debtor.id, to: creditor.id, amount });
      debtor.left -= amount;
      creditor.left -= amount;
    }
  }
  return transfers;
}
