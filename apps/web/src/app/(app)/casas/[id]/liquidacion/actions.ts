"use server";

import { revalidatePath } from "next/cache";
import { bogotaToday } from "@/lib/expenses";
import { housePartnerIds, loadHouseFinance } from "@/lib/houses";
import { requireMembership, requireWriter } from "@/lib/membership";
import { parsePesos } from "@/lib/money";

export type SettleState = { error?: string; ok?: string };

function refresh(houseId: string) {
  revalidatePath(`/casas/${houseId}/liquidacion`);
  revalidatePath(`/casas/${houseId}`);
  revalidatePath(`/ventas/${houseId}`);
  revalidatePath("/");
}

export async function createTransfer(_: SettleState, form: FormData): Promise<SettleState> {
  const houseId = String(form.get("house_id") ?? "");
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const amount = parsePesos(String(form.get("amount") ?? ""));
  const on = String(form.get("transferred_on") ?? "");
  if (!amount || amount <= 0n) return { error: "Escribe el valor en pesos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > bogotaToday()) return { error: "Revisa la fecha." };
  if (from === to) return { error: "Quien pasa y quien recibe deben ser distintos." };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };
  const partners = await housePartnerIds(ctx.supabase, houseId);
  if (!partners.includes(from) || !partners.includes(to)) return { error: "Ambos deben ser socios de esta casa." };

  const { error } = await ctx.supabase.from("partner_transfers").insert({
    organization_id: ctx.membership.organization.id,
    house_id: houseId,
    from_partner_id: from,
    to_partner_id: to,
    amount: Number(amount),
    transferred_on: on,
  });
  if (error) {
    return { error: error.message.includes("settled") ? "La casa ya está liquidada." : "No pudimos guardar el traslado." };
  }
  refresh(houseId);
  return { ok: "Traslado registrado." };
}

export async function voidTransfer(_: SettleState, form: FormData): Promise<SettleState> {
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué se anula." };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };
  const { data, error } = await ctx.supabase
    .from("partner_transfers")
    .update({ status: "voided", voided_reason: reason })
    .eq("id", id)
    .eq("status", "active")
    .select("house_id");
  if (error || !data?.length) return { error: "No pudimos anular el traslado." };
  refresh(data[0]!.house_id);
  return { ok: "Traslado anulado." };
}

const str = (v: bigint) => v.toString();

/** Freezes the settlement as it stands today. The database hashes it; each partner then approves it with their PIN. */
export async function createSettlement(_: SettleState, form: FormData): Promise<SettleState> {
  const houseId = String(form.get("house_id") ?? "");
  const { supabase, membership } = await requireMembership();
  if (membership?.role !== "admin") return { error: "Solo el administrador genera la liquidación final." };

  const { data: house } = await supabase.from("houses").select("id, name, stage").eq("id", houseId).maybeSingle();
  if (!house) return { error: "No encontramos la casa." };
  if (house.stage === "settled") return { error: "La casa ya está liquidada." };

  const { partners, settlement } = await loadHouseFinance(supabase, houseId, null);
  if (settlement.received <= 0n) return { error: "Todavía no se ha recibido plata de la venta." };
  if (settlement.partners.some((p) => p.balance !== 0n)) {
    return { error: "Primero registren los traslados entre socios hasta quedar a paz y salvo." };
  }

  const { data: last } = await supabase
    .from("settlements")
    .select("version")
    .eq("house_id", houseId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const name = new Map(partners.map((p) => [p.id, p]));

  const { error } = await supabase.from("settlements").insert({
    organization_id: membership.organization.id,
    house_id: houseId,
    version: (last?.version ?? 0) + 1,
    hash: "",
    breakdown: {
      house: { id: house.id, name: house.name },
      generated_on: bogotaToday(),
      received: str(settlement.received),
      total_sale_costs: str(settlement.totalSaleCosts),
      net_received: str(settlement.netReceived),
      total_capital: str(settlement.totalCapital),
      total_profit: str(settlement.totalProfit),
      capital_recovered: settlement.capitalRecovered,
      partners: settlement.partners.map((p) => ({
        id: p.partnerId,
        name: name.get(p.partnerId)?.name,
        profit_share_bps: name.get(p.partnerId)?.profitShareBps,
        contributed: str(p.contributed),
        sale_costs_paid: str(p.saleCostsPaid),
        sale_costs_reimbursed: str(p.saleCostsReimbursed),
        capital_returned: str(p.capitalReturned),
        profit: str(p.profit),
        entitled: str(p.entitled),
        held: str(p.held),
      })),
    },
  });
  if (error) return { error: "No pudimos generar la liquidación." };
  refresh(houseId);
  return { ok: "Liquidación generada. Ahora cada socio la aprueba con su PIN." };
}

const PIN_RESULTS: Record<string, string> = {
  wrong: "PIN equivocado.",
  locked: "Tu PIN quedó bloqueado. Sal y entra de nuevo con tu correo.",
  no_pin: "Primero crea tu PIN.",
};

export async function approveSettlement(_: SettleState, form: FormData): Promise<SettleState> {
  const settlementId = String(form.get("settlement_id") ?? "");
  const houseId = String(form.get("house_id") ?? "");
  const pin = String(form.get("pin") ?? "");
  if (!/^\d{4}$/.test(pin)) return { error: "El PIN son 4 números." };

  const { supabase } = await requireMembership();
  const { data, error } = await supabase.rpc("approve_settlement", { settlement: settlementId, pin });
  if (error) {
    if (error.message.includes("outdated")) {
      return { error: "Hubo movimientos después de generar esta liquidación. Hay que generar una nueva." };
    }
    return { error: "No pudimos registrar tu aprobación." };
  }
  if (data in PIN_RESULTS) return { error: PIN_RESULTS[data] };

  refresh(houseId);
  return { ok: data === "settled" ? "Aprobada por todos. La casa quedó liquidada." : "Tu aprobación quedó registrada." };
}
