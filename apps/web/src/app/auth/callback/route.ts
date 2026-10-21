import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Landing for the link in the sign-in email (the code typed on /entrar works too). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/entrar?motivo=enlace", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/entrar?motivo=enlace", request.url));

  await supabase.rpc("accept_invitations");
  return NextResponse.redirect(new URL("/pin", request.url));
}
