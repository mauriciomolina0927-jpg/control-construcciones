import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pinSessionSecret, supabaseKey, supabaseUrl } from "@/lib/env";
import { isPinSessionValid, PIN_COOKIE, pinCookieOptions, signPinSession } from "@/lib/pin-session";

const PUBLIC_PATHS = ["/entrar", "/auth/callback"];

/**
 * Refreshes the Supabase session and sends each request to the right door:
 * no session → /entrar (email); session without a fresh PIN → /pin; otherwise the app.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  const redirect = (to: string) => {
    const target = NextResponse.redirect(new URL(to, request.url));
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  };

  if (!user) return isPublic ? response : redirect("/entrar");
  if (isPublic) return path.startsWith("/entrar") ? redirect("/pin") : response;

  const secret = pinSessionSecret();
  const pinOk = isPinSessionValid(request.cookies.get(PIN_COOKIE)?.value, user.id, secret);
  if (!pinOk) return path === "/pin" ? response : redirect("/pin");
  if (path === "/pin") return redirect("/");

  response.cookies.set(PIN_COOKIE, signPinSession(user.id, secret), pinCookieOptions);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
