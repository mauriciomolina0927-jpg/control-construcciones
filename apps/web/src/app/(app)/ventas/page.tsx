import Link from "next/link";
import { StageChip } from "@/components/stage-chip";
import { Card, PageTitle } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import type { Stage } from "@/lib/stages";

export default async function SalesPage() {
  const { supabase } = await requireMembership();
  // Explicit foreign keys: sale_payments links houses and sales, so "sales" alone would be ambiguous.
  const { data: houses } = await supabase
    .from("houses")
    .select("id, name, stage, sales!sales_organization_id_house_id_fkey (buyer_name, agreed_price, status), sale_payments!sale_payments_organization_id_house_id_fkey (amount, status)")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    name: string;
    stage: Stage;
    sales: { buyer_name: string; agreed_price: number; status: string }[];
    sale_payments: { amount: number; status: string }[];
  };

  return (
    <>
      <PageTitle title="Ventas" subtitle="Compradores, precio pactado y abonos de cada casa." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(houses ?? []).length === 0 && (
        <Card>
          <p className="text-sm text-foreground/60">Todavía no hay casas.</p>
        </Card>
      )}
      {((houses ?? []) as unknown as Row[]).map((h) => {
        const sale = h.sales.find((s) => s.status !== "cancelled");
        const received = h.sale_payments
          .filter((p) => p.status === "active")
          .reduce((sum, p) => sum + toPesos(p.amount), 0n);
        const missing = sale ? toPesos(sale.agreed_price) - received : 0n;
        return (
          <Link key={h.id} href={`/ventas/${h.id}`} className="block">
            <Card className="h-full space-y-1 transition-colors hover:border-foreground/20">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium tracking-tight">{h.name}</h2>
                <StageChip stage={h.stage} />
              </div>
              {sale ? (
                <>
                  <p className="text-sm">
                    {sale.buyer_name} · pactado {formatPesos(toPesos(sale.agreed_price))}
                  </p>
                  <p className="text-sm text-foreground/60">
                    Recibido {formatPesos(received)}
                    {missing > 0n && ` · faltan ${formatPesos(missing)}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-foreground/60">Sin venta registrada</p>
              )}
            </Card>
          </Link>
        );
      })}
      </div>
    </>
  );
}
