"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect } from "react";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/**
 * Landing for the link in the sign-in email. Supabase puts the session in the part of the address after "#",
 * which only the browser can read, so this page saves it as cookies and moves on to the PIN.
 */
export default function ConfirmPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      window.location.replace("/entrar?motivo=enlace");
      return;
    }

    const supabase = createBrowserClient(supabaseUrl(), supabaseKey());
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(async ({ error }) => {
        if (error) throw error;
        await supabase.rpc("accept_invitations");
        window.location.replace("/pin");
      })
      .catch(() => window.location.replace("/entrar?motivo=enlace"));
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <p className="text-sm text-foreground/70">Entrando…</p>
    </main>
  );
}
