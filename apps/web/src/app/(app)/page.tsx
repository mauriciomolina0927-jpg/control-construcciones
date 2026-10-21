import Link from "next/link";
import { Card } from "@/components/ui";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";

export default async function TodayPage() {
  const { supabase } = await requireMembership();
  const { data: houses } = await supabase
    .from("houses")
    .select("id, name, expected_price")
    .neq("stage", "settled")
    .order("created_at");

  const items = await Promise.all(
    (houses ?? []).map(async (h) => {
      const f = await loadHouseFinance(supabase, h.id, toPesos(h.expected_price) || null);
      const name = new Map(f.partners.map((p) => [p.id, p.name]));
      const owed = f.settlement.partners
        .filter((p) => p.balance > 0n)
        .map((p) => `A ${name.get(p.partnerId)} le deben ${formatPesos(p.balance)}`);
      return { ...h, withoutReceipt: f.expensesWithoutReceipt, owed };
    }),
  );
  const pending = items.filter((i) => i.withoutReceipt > 0 || i.owed.length > 0);

  return (
    <>
      <h1 className="text-xl font-bold">Hoy</h1>
      {pending.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/70">Nada pendiente por ahora.</p>
        </Card>
      ) : (
        pending.map((i) => (
          <Link key={i.id} href={`/casas/${i.id}`} className="block">
            <Card className="space-y-1">
              <h2 className="font-semibold">{i.name}</h2>
              {i.withoutReceipt > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {i.withoutReceipt === 1 ? "1 gasto sin soporte" : `${i.withoutReceipt} gastos sin soporte`}
                </p>
              )}
              {i.owed.map((line) => (
                <p key={line} className="text-sm">
                  {line}
                </p>
              ))}
            </Card>
          </Link>
        ))
      )}
    </>
  );
}
