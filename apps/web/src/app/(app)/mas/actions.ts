"use server";

import { MIN_PASSWORD } from "@/app/entrar/password";
import { requireMembership } from "@/lib/membership";

export type PasswordState = { error?: string; ok?: string };

export async function changePassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  if (password !== String(form.get("repeat") ?? "")) return { error: "Las dos contraseñas no son iguales." };

  const { supabase } = await requireMembership();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No pudimos guardar la contraseña. Intenta otra vez." };
  return { ok: "Listo. La próxima vez entras con tu correo y esta contraseña." };
}
