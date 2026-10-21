import { redirect } from "next/navigation";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's organization and role. Today a person belongs to one organization. */
export async function requireMembership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data } = await supabase
    .from("memberships")
    .select("role, organization:organizations (id, name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const organization = data?.organization as { id: string; name: string } | null | undefined;
  if (!data || !organization) return { supabase, user, membership: null };
  return { supabase, user, membership: { role: data.role as Role, organization } };
}

/** The membership of someone who may register money (admin or the operating partner), or null. */
export async function requireWriter() {
  const ctx = await requireMembership();
  if (ctx.membership?.role !== "admin" && ctx.membership?.role !== "partner") return null;
  return { ...ctx, membership: ctx.membership };
}
