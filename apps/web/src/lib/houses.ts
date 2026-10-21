import { settle, type Expense, type Partner, type PartnerTransfer, type SalePayment, type Settlement } from "@cc/settlement";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toPesos } from "@/lib/money";

export type HouseFinance = {
  partners: (Partner & { userId: string | null })[];
  settlement: Settlement;
  /** The same settlement if the house sold today at its expected price. */
  projected: Settlement | null;
  expensesWithoutReceipt: number;
};

/** Loads a house's money and runs the settlement waterfall over it. */
export async function loadHouseFinance(
  supabase: SupabaseClient,
  houseId: string,
  expectedPrice: bigint | null,
): Promise<HouseFinance> {
  const [agreement, expenses, payments, transfers] = await Promise.all([
    supabase
      .from("house_agreements")
      .select("version, house_agreement_partners (profit_share_bps, partner:partners (id, name, user_id))")
      .eq("house_id", houseId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("expenses").select("id, amount, kind, paid_by_partner_id, status, has_receipt").eq("house_id", houseId),
    supabase.from("sale_payments").select("id, amount, paid_on, received_by_partner_id, status").eq("house_id", houseId),
    supabase
      .from("partner_transfers")
      .select("id, amount, from_partner_id, to_partner_id")
      .eq("house_id", houseId)
      .eq("status", "active"),
  ]);

  type Row = { profit_share_bps: number; partner: { id: string; name: string; user_id: string | null } };
  const rows = (agreement.data?.house_agreement_partners ?? []) as unknown as Row[];
  const partners = rows.map((r) => ({
    id: r.partner.id,
    name: r.partner.name,
    userId: r.partner.user_id,
    profitShareBps: r.profit_share_bps,
  }));

  const expenseList: Expense[] = (expenses.data ?? []).map((e) => ({
    id: e.id,
    amount: toPesos(e.amount),
    kind: e.kind,
    paidBy: e.paid_by_partner_id,
    status: e.status,
  }));
  const paymentList: SalePayment[] = (payments.data ?? []).map((p) => ({
    id: p.id,
    amount: toPesos(p.amount),
    date: p.paid_on,
    receivedBy: p.received_by_partner_id,
    status: p.status,
  }));
  const transferList: PartnerTransfer[] = (transfers.data ?? []).map((t) => ({
    id: t.id,
    amount: toPesos(t.amount),
    from: t.from_partner_id,
    to: t.to_partner_id,
  }));

  if (partners.length === 0) {
    throw new Error(`House ${houseId} has no agreement`);
  }

  const settlement = settle({ partners, expenses: expenseList, payments: paymentList, transfers: transferList });

  // Projection: what each partner would get if the expected price came in today, all received by the first partner.
  const projected =
    expectedPrice && expectedPrice > 0n
      ? settle({
          partners,
          expenses: expenseList,
          payments: [{ id: "projected", amount: expectedPrice, date: "", receivedBy: partners[0]!.id, status: "active" }],
        })
      : null;

  const expensesWithoutReceipt = (expenses.data ?? []).filter((e) => e.status === "active" && !e.has_receipt).length;
  return { partners, settlement, projected, expensesWithoutReceipt };
}

/** Partners of the house's current agreement. Money can only be paid or received by one of them. */
export async function housePartnerIds(supabase: SupabaseClient, houseId: string): Promise<string[]> {
  const { data } = await supabase
    .from("house_agreements")
    .select("house_agreement_partners (partner_id)")
    .eq("house_id", houseId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.house_agreement_partners ?? []).map((p: { partner_id: string }) => p.partner_id);
}
