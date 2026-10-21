"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/membership";
import { parsePesos } from "@/lib/money";
import { equalShares, PICKABLE_STAGES, type Stage } from "@/lib/stages";

export type HouseFormState = { error?: string };

export async function createHouse(_: HouseFormState, form: FormData): Promise<HouseFormState> {
  const name = String(form.get("name") ?? "").trim();
  const address = String(form.get("address") ?? "");
  const stage = String(form.get("stage") ?? "") as Stage;
  const priceText = String(form.get("expected_price") ?? "").trim();
  const partnerIds = form.getAll("partner_id").map(String);

  if (!name) return { error: "Escribe un nombre para la casa." };
  if (!PICKABLE_STAGES.includes(stage)) return { error: "Elige la etapa." };
  const expectedPrice = priceText ? parsePesos(priceText) : null;
  if (priceText && !expectedPrice) return { error: "El precio esperado debe ser un valor en pesos, sin centavos." };
  if (partnerIds.length === 0) return { error: "Elige los socios de esta casa." };

  const { supabase, membership } = await requireMembership();
  if (membership?.role !== "admin") return { error: "Solo el administrador crea casas." };

  const { data: houseId, error } = await supabase.rpc("create_house", {
    organization_id: membership.organization.id,
    name,
    address,
    stage,
    expected_price: expectedPrice === null ? null : Number(expectedPrice),
    partners: equalShares(partnerIds),
  });
  if (error || !houseId) return { error: "No pudimos crear la casa." };

  revalidatePath("/casas");
  redirect(`/casas/${houseId}`);
}

export async function changeStage(form: FormData): Promise<void> {
  const houseId = String(form.get("house_id") ?? "");
  const stage = String(form.get("stage") ?? "") as Stage;
  if (!PICKABLE_STAGES.includes(stage)) return;

  const { supabase } = await requireMembership();
  await supabase.from("houses").update({ stage }).eq("id", houseId).neq("stage", "settled");
  revalidatePath(`/casas/${houseId}`);
}
