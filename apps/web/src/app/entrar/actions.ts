"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { step: "email" | "code"; email: string; error?: string; info?: string };

export async function sendCode(_: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { step: "email", email, error: "Escribe un correo válido." };

  const supabase = await createClient();
  const { data: invited, error: inviteError } = await supabase.rpc("is_invited", { email });
  if (inviteError) return { step: "email", email, error: "No pudimos revisar el correo. Intenta otra vez." };
  if (!invited) {
    return { step: "email", email, error: "Este correo no tiene invitación. Pídele a Mauricio que te invite." };
  }

  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { step: "email", email, error: "No pudimos enviar el correo. Espera un minuto e intenta otra vez." };

  return { step: "code", email, info: `Te enviamos un código a ${email}.` };
}

export async function verifyCode(state: SignInState, form: FormData): Promise<SignInState> {
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(token)) return { ...state, error: "El código tiene solo números." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: state.email, token, type: "email" });
  if (error) return { ...state, error: "El código no es válido o ya venció." };

  await supabase.rpc("accept_invitations");
  redirect("/pin");
}

export async function signInStep(state: SignInState, form: FormData): Promise<SignInState> {
  if (form.get("restart")) return { step: "email", email: "" };
  return state.step === "email" ? sendCode(state, form) : verifyCode(state, form);
}
