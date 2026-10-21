"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pinSessionSecret } from "@/lib/env";
import { PIN_COOKIE, pinCookieOptions, signPinSession } from "@/lib/pin-session";
import { createClient } from "@/lib/supabase/server";

export type PinState = { error?: string };

async function unlock(userId: string): Promise<never> {
  (await cookies()).set(PIN_COOKIE, signPinSession(userId, pinSessionSecret()), pinCookieOptions);
  redirect("/");
}

export async function enterPin(_: PinState, form: FormData): Promise<PinState> {
  const pin = String(form.get("pin") ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data: result, error } = await supabase.rpc("verify_pin", { pin });
  if (error) return { error: "No pudimos revisar el PIN. Intenta otra vez." };
  if (result === "ok") return unlock(user.id);
  if (result === "locked") {
    await supabase.auth.signOut();
    redirect("/entrar?motivo=bloqueado");
  }
  if (result === "no_pin") redirect("/pin");
  return { error: "PIN incorrecto. Después de 5 intentos tendrás que entrar con tu correo." };
}

export async function createPin(_: PinState, form: FormData): Promise<PinState> {
  const pin = String(form.get("pin") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!/^\d{4}$/.test(pin)) return { error: "El PIN debe tener 4 números." };
  if (pin !== confirm) return { error: "Los dos PIN no coinciden." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { error } = await supabase.rpc("set_pin", { pin });
  if (error) {
    return { error: "Para cambiar el PIN entra otra vez con tu correo (el ingreso vale 15 minutos)." };
  }
  return unlock(user.id);
}

export async function forgotPin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar?motivo=olvido");
}
