"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/membership";
import type { Role } from "@/lib/roles";
import { normalizePhone } from "@/lib/whatsapp/phone";

export type FormState = { error?: string; ok?: string };

const ROLES: Role[] = ["admin", "partner", "viewer"];

async function requireAdmin() {
  const ctx = await requireMembership();
  if (ctx.membership?.role !== "admin") throw new Error("Solo el administrador puede hacer esto.");
  return { ...ctx, organizationId: ctx.membership.organization.id };
}

export async function addPartner(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre del socio." };

  const { supabase, organizationId } = await requireAdmin();
  const { error } = await supabase.from("partners").insert({ organization_id: organizationId, name });
  if (error) return { error: "No pudimos guardar el socio." };

  revalidatePath("/mas/ajustes");
  return { ok: `${name} quedó agregado.` };
}

export async function invite(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "") as Role;
  const partnerId = String(form.get("partner_id") ?? "") || null;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Escribe un correo válido." };
  if (!ROLES.includes(role)) return { error: "Elige un rol." };

  const { supabase, organizationId } = await requireAdmin();
  const { error } = await supabase
    .from("invitations")
    .insert({ organization_id: organizationId, email, role, partner_id: partnerId });
  if (error) {
    return { error: error.code === "23505" ? "Ese correo ya tiene invitación." : "No pudimos guardar la invitación." };
  }

  revalidatePath("/mas/ajustes");
  return { ok: `Listo. ${email} ya puede entrar: la primera vez crea su contraseña.` };
}

export async function cancelInvitation(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const { supabase } = await requireAdmin();
  await supabase.from("invitations").delete().eq("id", id).is("accepted_at", null);
  revalidatePath("/mas/ajustes");
}

export async function setWhatsappPhone(_: FormState, form: FormData): Promise<FormState> {
  const partnerId = String(form.get("partner_id") ?? "");
  const text = String(form.get("phone") ?? "").trim();
  const phone = text ? normalizePhone(text) : null;
  if (text && !phone) return { error: "Escribe el celular con 10 dígitos, por ejemplo 300 111 2233." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("partners").update({ whatsapp_phone: phone }).eq("id", partnerId);
  if (error) return { error: error.code === "23505" ? "Ese número ya es de otro socio." : "No pudimos guardar el número." };

  revalidatePath("/mas/ajustes");
  return { ok: phone ? "Número guardado. Ya puede escribir al WhatsApp de la empresa." : "Número quitado." };
}
