import Link from "next/link";
import { Card } from "@/components/ui";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { STAGE_LABELS, type Stage } from "@/lib/stages";

export default async function HousesPage() {
  const { supabase, membership } = await requireMembership();
  const { data: houses } = await supabase
    .from("houses")
    .select("id, name, address, stage, expected_price")
    .order("created_at", { ascending: false });

  const rows = await Promise.all(
    (houses ?? []).map(async (h) => ({
      ...h,
      finance: await loadHouseFinance(supabase, h.id, toPesos(h.expected_price) || null),
    })),
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Casas</h1>
        {membership?.role === "admin" && (
          <Link href="/casas/nueva" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
            Nueva casa
          </Link>
        )}
      </div>
      {rows.length === 0 && (
        <Card>
          <p className="text-sm text-foreground/70">Todavía no hay casas registradas.</p>
        </Card>
      )}
      {rows.map((h) => (
        <Link key={h.id} href={`/casas/${h.id}`} className="block">
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{h.name}</h2>
                {h.address && <p className="text-sm text-foreground/60">{h.address}</p>}
              </div>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                {STAGE_LABELS[h.stage as Stage]}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-foreground/60">Capital invertido</dt>
                <dd className="font-semibold">{formatPesos(h.finance.settlement.totalCapital)}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Gastos sin soporte</dt>
                <dd className={`font-semibold ${h.finance.expensesWithoutReceipt ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {h.finance.expensesWithoutReceipt}
                </dd>
              </div>
            </dl>
          </Card>
        </Link>
      ))}
    </>
  );
}
