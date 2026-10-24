import Link from "next/link";
import { StageChip } from "@/components/stage-chip";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import type { Stage } from "@/lib/stages";

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
      <PageTitle
        title="Casas"
        subtitle={rows.length === 1 ? "1 casa" : `${rows.length} casas`}
        actions={membership?.role === "admin" && <LinkButton href="/casas/nueva">+ Nueva casa</LinkButton>}
      />
      {rows.length === 0 && (
        <Card>
          <p className="text-sm text-foreground/60">Todavía no hay casas registradas.</p>
        </Card>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((h) => (
          <Link key={h.id} href={`/casas/${h.id}`} className="block">
            <Card className="h-full space-y-4 transition-colors hover:border-foreground/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-medium tracking-tight">{h.name}</h2>
                  {h.address && <p className="truncate text-sm text-foreground/60">{h.address}</p>}
                </div>
                <StageChip stage={h.stage as Stage} />
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[13px] text-foreground/60">Invertido</dt>
                  <dd className="mt-0.5 text-lg font-medium tracking-tight md:text-xl">{formatPesos(h.finance.settlement.totalCapital)}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-foreground/60">Sin soporte</dt>
                  <dd className={`mt-0.5 text-xl font-medium tracking-tight ${h.finance.expensesWithoutReceipt ? "text-red-600" : ""}`}>
                    {h.finance.expensesWithoutReceipt}
                  </dd>
                </div>
              </dl>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
