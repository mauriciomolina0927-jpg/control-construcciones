import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { BottomNav, TopNav } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { membership, user } = await requireMembership();
  const canRegister = membership?.role === "admin" || membership?.role === "partner";
  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col pb-28 md:pb-10">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 pt-4 md:px-8 md:pt-6">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11 12 4l9 7M6 10v10h12V10" />
            </svg>
          </span>
          {membership?.organization.name ?? "Control de obra"}
        </Link>
        <div className="hidden md:block">{membership && <TopNav />}</div>
        <div className="flex items-center gap-2">
          {canRegister && (
            <span className="hidden md:block">
              <LinkButton href="/gastos/nuevo" className="px-4 py-2.5 text-sm">
                + Registrar gasto
              </LinkButton>
            </span>
          )}
          <Link
            href="/mas"
            aria-label="Tu cuenta"
            className="flex size-9 items-center justify-center rounded-full bg-foreground text-xs font-medium text-white"
          >
            {initial}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-4 px-4 pt-5 md:gap-5 md:px-8 md:pt-8">
        {membership ? (
          children
        ) : (
          <Card>
            <h1 className="text-lg font-medium">Todavía no tienes acceso</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Tu correo no está vinculado a ninguna empresa. Pídele a Mauricio que te invite.
            </p>
          </Card>
        )}
      </main>
      {membership && <BottomNav canRegister={canRegister} />}
    </div>
  );
}
