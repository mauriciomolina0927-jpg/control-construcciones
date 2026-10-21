"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { bogotaToday, kindOf, LAST_PAYER_COOKIE } from "@/lib/expenses";
import { housePartnerIds } from "@/lib/houses";
import { requireWriter } from "@/lib/membership";
import { parsePesos } from "@/lib/money";
import { checkReceipt, storeReceipt, whatsappReceipt } from "@/lib/receipts";

export type ExpenseFormState = { error?: string };

export async function createExpense(_: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  const amount = parsePesos(String(form.get("amount") ?? ""));
  const spentOn = String(form.get("spent_on") ?? "");
  const houseId = String(form.get("house_id") ?? "");
  const category = String(form.get("category") ?? "");
  const kind = kindOf(category);
  const paidBy = String(form.get("paid_by") ?? "");
  const supplier = String(form.get("supplier") ?? "").trim() || null;
  const description = String(form.get("description") ?? "").trim() || null;
  const replacesId = String(form.get("replaces_id") ?? "") || null;
  const suggestionId = String(form.get("suggestion_id") ?? "") || null;

  if (!amount || amount <= 0n) return { error: "Escribe el valor en pesos, sin centavos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn) || spentOn > bogotaToday()) return { error: "Revisa la fecha." };
  if (!houseId) return { error: "Elige a qué casa va el gasto." };
  if (!kind) return { error: "Elige la categoría." };
  if (!paidBy) return { error: "Elige quién pagó." };

  const receipt = await checkReceipt(form.get("receipt"));
  if (receipt && "error" in receipt) return { error: receipt.error };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };
  const { supabase, membership } = ctx;

  // Whoever paid must be a partner of this house, or the settlement would not know whom to pay back.
  if (!(await housePartnerIds(supabase, houseId)).includes(paidBy)) return { error: "Quien pagó debe ser socio de esa casa." };

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      organization_id: membership.organization.id,
      house_id: houseId,
      amount: Number(amount),
      spent_on: spentOn,
      kind,
      category,
      supplier_name: supplier,
      description,
      paid_by_partner_id: paidBy,
      replaces_id: replacesId,
      source: suggestionId ? "whatsapp" : "manual",
    })
    .select("id")
    .single();
  if (error || !expense) {
    if (error?.message.includes("settled")) return { error: "Esa casa ya está liquidada y no recibe gastos." };
    if (error?.message.includes("corrected")) return { error: "Ese gasto ya fue corregido antes." };
    return { error: "No pudimos guardar el gasto. Intenta de nuevo." };
  }

  (await cookies()).set(LAST_PAYER_COOKIE, paidBy, { path: "/gastos", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  let notice = "guardado";
  // A confirmed WhatsApp expense keeps the photo that came with the message, unless another one was chosen.
  const kept = receipt ?? (suggestionId ? await whatsappReceipt(supabase, suggestionId) : null);
  if (kept) {
    const stored = await storeReceipt(
      supabase,
      { organizationId: membership.organization.id, houseId, type: "expense", id: expense.id },
      kept,
    );
    if (!stored) notice = "sin-foto";
  }

  if (suggestionId) {
    const { error: reviewError } = await supabase
      .from("expense_suggestions")
      .update({ status: "confirmed", expense_id: expense.id })
      .eq("id", suggestionId)
      .eq("status", "pending");
    if (reviewError) notice = "sin-cerrar";
  }

  revalidatePath("/dinero");
  revalidatePath(`/casas/${houseId}`);
  revalidatePath("/");
  if (suggestionId) {
    revalidatePath("/dinero/revisar");
    redirect(`/dinero/revisar?aviso=${notice === "guardado" ? "confirmado" : notice}`);
  }
  redirect(`/dinero/${expense.id}?aviso=${notice}`);
}

export type ActionState = { error?: string; ok?: string };

export async function voidExpense(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué se anula." };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };

  const { data, error } = await ctx.supabase
    .from("expenses")
    .update({ status: "voided", voided_reason: reason })
    .eq("id", id)
    .eq("status", "active")
    .select("house_id");
  if (error || !data?.length) return { error: "No pudimos anular el gasto." };

  revalidatePath("/dinero");
  revalidatePath(`/dinero/${id}`);
  revalidatePath(`/casas/${data[0]!.house_id}`);
  return { ok: "Gasto anulado." };
}

export async function addReceipt(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const receipt = await checkReceipt(form.get("receipt"));
  if (!receipt) return { error: "Toma o elige la foto del soporte." };
  if ("error" in receipt) return { error: receipt.error };

  const ctx = await requireWriter();
  if (!ctx) return { error: "Tu usuario solo puede consultar." };

  const { data: expense } = await ctx.supabase
    .from("expenses")
    .select("organization_id, house_id")
    .eq("id", id)
    .maybeSingle();
  if (!expense) return { error: "No encontramos el gasto." };

  const stored = await storeReceipt(
    ctx.supabase,
    { organizationId: expense.organization_id, houseId: expense.house_id, type: "expense", id },
    receipt,
  );
  if (!stored) return { error: "No pudimos subir el soporte. Intenta de nuevo." };

  revalidatePath("/dinero");
  revalidatePath(`/dinero/${id}`);
  revalidatePath(`/casas/${expense.house_id}`);
  return { ok: "Soporte agregado." };
}

export async function discardSuggestion(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ctx = await requireWriter();
  if (!ctx) return;
  await ctx.supabase.from("expense_suggestions").update({ status: "discarded" }).eq("id", id).eq("status", "pending");
  revalidatePath("/dinero/revisar");
  revalidatePath("/");
  redirect("/dinero/revisar?aviso=descartado");
}
