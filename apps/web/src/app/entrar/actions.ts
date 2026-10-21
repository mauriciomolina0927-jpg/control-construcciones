"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createLinkClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD } from "./password";

/**
 * - "password": email and password (the usual way).
 * - "create": first time, the person picks a password.
 * - "link": an email with a link, for an account that has no password yet. The free plan sends 2 emails per hour.
 */
export type SignInMode = "password" | "create" | "link";
export type SignInState = { mode: SignInMode; email: string; error?: string; info?: string };

async function checkInvited(state: SignInState, email: string): Promise<SignInState | null> {
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ...state, email, error: "Escribe un correo válido." };
  const supabase = await createClient();
  const { data: invited, error } = await supabase.rpc("is_invited", { email });
  if (error) return { ...state, email, error: "No pudimos revisar el correo. Intenta otra vez." };
  if (!invited) return { ...state, email, error: "Este correo no tiene invitación. Pídele a Mauricio que te invite." };
  return null;
}

async function signIn(state: SignInState, email: string, password: string): Promise<SignInState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ...state, email, error: "El correo o la contraseña no coinciden. Si es tu primera vez, crea tu contraseña." };
  }
  await supabase.rpc("accept_invitations");
  redirect("/pin");
}

// Needs "Confirm email" turned off in Supabase, so creating the account signs in right away without sending an email.
async function create(state: SignInState, email: string, password: string, repeat: string): Promise<SignInState> {
  if (password.length < MIN_PASSWORD) {
    return { ...state, email, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (password !== repeat) return { ...state, email, error: "Las dos contraseñas no son iguales." };
  const blocked = await checkInvited(state, email);
  if (blocked) return blocked;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  // Supabase answers an existing email with a user that has no identities instead of an error.
  if (error || !data.session || data.user?.identities?.length === 0) {
    return {
      ...state,
      email,
      error: "Ese correo ya tiene cuenta. Entra con tu contraseña, o con el enlace al correo si nunca la creaste.",
    };
  }
  await supabase.rpc("accept_invitations");
  redirect("/pin");
}

async function sendLink(state: SignInState, email: string): Promise<SignInState> {
  const blocked = await checkInvited(state, email);
  if (blocked) return blocked;

  const origin = (await headers()).get("origin") ?? "";
  // The email link uses the implicit flow so it works on any phone or browser, not only the one that asked
  // for it (the PKCE flow needs a cookie from the browser that sent the request). /auth/confirm takes it from there.
  const linkClient = createLinkClient(supabaseUrl(), supabaseKey(), {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await linkClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    const tooMany = error.code === "over_email_send_rate_limit";
    return {
      ...state,
      email,
      error: tooMany
        ? "Ya se enviaron los correos permitidos por esta hora. Intenta más tarde o entra con tu contraseña."
        : "No pudimos enviar el correo. Intenta otra vez.",
    };
  }
  return { ...state, email, error: undefined, info: `Te enviamos un enlace a ${email}. Ábrelo una sola vez.` };
}

export async function signInStep(state: SignInState, form: FormData): Promise<SignInState> {
  const mode = String(form.get("mode") ?? "");
  if (mode === "password" || mode === "create" || mode === "link") return { mode, email: state.email };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (state.mode === "link") return sendLink(state, email);
  if (state.mode === "create") return create(state, email, password, String(form.get("repeat") ?? ""));
  return signIn(state, email, password);
}
