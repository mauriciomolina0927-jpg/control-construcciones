import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { AddExpenseButton, BottomNav } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { membership } = await requireMembership();

  return (
    <div className="flex flex-1 flex-col pb-20">
      <header className="bg-brand px-4 py-3 text-white">
        <p className="mx-auto max-w-xl text-sm font-semibold">{membership?.organization.name ?? "Control de obra"}</p>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 p-4">
        {membership ? (
          children
        ) : (
          <Card>
            <h1 className="text-lg font-semibold">Todavía no tienes acceso</h1>
            <p className="mt-2 text-sm text-foreground/70">
              Tu correo no está vinculado a ninguna empresa. Pídele a Mauricio que te invite.
            </p>
          </Card>
        )}
      </main>
      {(membership?.role === "admin" || membership?.role === "partner") && <AddExpenseButton />}
      <BottomNav />
    </div>
  );
}
