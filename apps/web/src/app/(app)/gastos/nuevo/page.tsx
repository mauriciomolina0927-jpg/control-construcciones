import { cookies } from "next/headers";
import Link from "next/link";
import { Card } from "@/components/ui";
import { bogotaToday, LAST_PAYER_COOKIE } from "@/lib/expenses";
import { requireMembership } from "@/lib/membership";
import { ExpenseForm, type ExpenseDefaults, type HouseOption } from "./expense-form";

export default async function NewExpensePage({ searchParams }: PageProps<"/gastos/nuevo">) {
  const { reemplaza } = await searchParams;
  const { supabase, membership, user } = await requireMembership();
  if (membership?.role !== "admin" && membership?.role !== "partner") {
    return (
      <Card>
        <p className="text-sm">Tu usuario solo puede consultar. Los gastos los registran Mauricio y Miguel.</p>
      </Card>
    );
  }

  const [{ data: houses }, { data: me }, { data: old }] = await Promise.all([
    supabase
      .from("houses")
      .select("id, name, house_agreements (version, house_agreement_partners (partner:partners (id, name)))")
      .neq("stage", "settled")
      .order("created_at"),
    supabase.from("partners").select("id").eq("user_id", user.id).maybeSingle(),
    typeof reemplaza === "string"
      ? supabase
          .from("expenses")
          .select("id, amount, spent_on, house_id, category, paid_by_partner_id, supplier_name, description")
          .eq("id", reemplaza)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type Agreement = { version: number; house_agreement_partners: { partner: { id: string; name: string } }[] };
  const options: HouseOption[] = (houses ?? []).map((h) => {
    const latest = (h.house_agreements as unknown as Agreement[]).toSorted((a, b) => b.version - a.version)[0];
    return { id: h.id, name: h.name, partners: (latest?.house_agreement_partners ?? []).map((p) => p.partner) };
  });

  const today = bogotaToday();
  const defaults: ExpenseDefaults = old
    ? {
        amount: String(old.amount),
        spentOn: old.spent_on,
        houseId: old.house_id,
        category: old.category,
        paidBy: old.paid_by_partner_id,
        supplier: old.supplier_name ?? undefined,
        description: old.description ?? undefined,
        replacesId: old.id,
      }
    : { spentOn: today, paidBy: (await cookies()).get(LAST_PAYER_COOKIE)?.value ?? me?.id };

  return (
    <>
      <header className="space-y-1">
        <Link href="/dinero" className="text-sm text-brand">
          ‹ Dinero
        </Link>
        <h1 className="text-xl font-bold">{old ? "Registrar el gasto correcto" : "Nuevo gasto"}</h1>
        {old && (
          <p className="text-sm text-foreground/60">Al guardar, el gasto anterior queda anulado y enlazado con este.</p>
        )}
      </header>
      <Card>
        {options.length === 0 ? (
          <p className="text-sm text-foreground/70">No hay casas activas. Crea una casa primero.</p>
        ) : (
          <ExpenseForm houses={options} defaults={defaults} today={today} />
        )}
      </Card>
    </>
  );
}
