"use server";

import { revalidatePath } from "next/cache";
import { bogotaToday } from "@/lib/expenses";
import { housePartnerIds } from "@/lib/houses";
import { requireWriter } from "@/lib/membership";
import { parsePesos } from "@/lib/money";
import { checkReceipt, storeReceipt } from "@/lib/receipts";
import { SOURCE_LABELS, type PaymentSource } from "@/lib/sales";

export type SaleFormState = { error?: string; ok?: string };

function refresh(houseId: string) {
  revalidatePath(`/ventas/${houseId}`);
  revalidatePath("/ventas");
  revalidatePath(`/casas/${houseId}`);
  revalidatePath(`/casas/${houseId}/liquidacion`);
  revalidatePath("/");
}

function settledMessage(message: string | undefined) {
  return message?.includes("settled") ? "La casa ya está liquidada y no recibe cambios." : undefined;
}

export async function createSale(_: SaleFormState, form: FormData): Promise<SaleFormState> {
  const houseId = String(form.get("house_id") ?? "");
  const buyer = String(form.get("buyer_name") ?? "").trim();
  const price = parsePesos(String(form.get("agreed_price") ?? ""));
  if (!buyer) return { error: "Escribe el nombre del comprador." };
  if (!price || price <= 0n) return { error: "Escribe el precio pactado en pesos." };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };
  const { supabase, membership } = ctx;

  const { data: house } = await supabase.from("houses").select("stage").eq("id", houseId).maybeSingle();
  if (!house) return { error: "No encontramos la casa." };
  if (house.stage === "settled") return { error: "La casa ya está liquidada." };

  const { error } = await supabase.from("sales").insert({
    organization_id: membership.organization.id,
    house_id: houseId,
    buyer_name: buyer,
    agreed_price: Number(price),
  });
  if (error) return { error: "No pudimos guardar la venta." };
  await supabase.from("houses").update({ stage: "sold" }).eq("id", houseId).neq("stage", "sold");

  refresh(houseId);
  return { ok: "Venta registrada." };
}

export async function createPayment(_: SaleFormState, form: FormData): Promise<SaleFormState> {
  const saleId = String(form.get("sale_id") ?? "");
  const amount = parsePesos(String(form.get("amount") ?? ""));
  const paidOn = String(form.get("paid_on") ?? "");
  const source = String(form.get("source") ?? "") as PaymentSource;
  const receivedBy = String(form.get("received_by") ?? "");
  const refund = form.get("refund") === "on";

  if (!amount || amount <= 0n) return { error: "Escribe el valor en pesos, sin centavos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > bogotaToday()) return { error: "Revisa la fecha." };
  if (!(source in SOURCE_LABELS)) return { error: "Elige de dónde vino la plata." };
  if (!receivedBy) return { error: refund ? "Elige quién devolvió la plata." : "Elige a quién le llegó la plata." };

  const receipt = await checkReceipt(form.get("receipt"));
  if (receipt && "error" in receipt) return { error: receipt.error };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };
  const { supabase, membership } = ctx;

  const { data: sale } = await supabase.from("sales").select("house_id").eq("id", saleId).maybeSingle();
  if (!sale) return { error: "No encontramos la venta." };
  if (!(await housePartnerIds(supabase, sale.house_id)).includes(receivedBy)) {
    return { error: "Quien recibió debe ser socio de esa casa." };
  }

  const { data: payment, error } = await supabase
    .from("sale_payments")
    .insert({
      organization_id: membership.organization.id,
      sale_id: saleId,
      house_id: sale.house_id,
      amount: Number(refund ? -amount : amount),
      paid_on: paidOn,
      source,
      received_by_partner_id: receivedBy,
    })
    .select("id")
    .single();
  if (error || !payment) return { error: settledMessage(error?.message) ?? "No pudimos guardar el abono." };

  let ok = refund ? "Devolución registrada." : "Abono registrado.";
  if (receipt) {
    const stored = await storeReceipt(
      supabase,
      { organizationId: membership.organization.id, houseId: sale.house_id, type: "sale_payment", id: payment.id },
      receipt,
    );
    if (!stored) ok += " La foto no subió; el abono quedó sin soporte.";
  }

  refresh(sale.house_id);
  return { ok };
}

export async function voidPayment(_: SaleFormState, form: FormData): Promise<SaleFormState> {
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué se anula." };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };

  const { data, error } = await ctx.supabase
    .from("sale_payments")
    .update({ status: "voided", voided_reason: reason })
    .eq("id", id)
    .eq("status", "active")
    .select("house_id");
  if (error || !data?.length) return { error: settledMessage(error?.message) ?? "No pudimos anular el abono." };

  refresh(data[0]!.house_id);
  return { ok: "Abono anulado." };
}
