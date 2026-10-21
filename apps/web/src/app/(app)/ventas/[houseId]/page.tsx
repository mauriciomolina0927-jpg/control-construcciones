import Link from "next/link";
import { notFound } from "next/navigation";
import { HouseHeader } from "@/components/house-header";
import { Card } from "@/components/ui";
import { bogotaToday } from "@/lib/expenses";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { SOURCE_LABELS, type PaymentSource } from "@/lib/sales";
import type { Stage } from "@/lib/stages";
import { PaymentForm, SaleForm, VoidPaymentForm } from "./forms";

export default async function HouseSalePage({ params }: PageProps<"/ventas/[houseId]">) {
  const { houseId } = await params;
  const { supabase, membership } = await requireMembership();

  const { data: house } = await supabase.from("houses").select("id, name, stage").eq("id", houseId).maybeSingle();
  if (!house) notFound();

  const [{ data: sales }, { data: payments }, finance] = await Promise.all([
    supabase.from("sales").select("id, buyer_name, agreed_price, status").eq("house_id", houseId).order("created_at"),
    supabase
      .from("sale_payments")
      .select("id, amount, paid_on, source, status, voided_reason, received_by_partner_id")
      .eq("house_id", houseId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
    loadHouseFinance(supabase, houseId, null),
  ]);

  const sale = (sales ?? []).find((s) => s.status !== "cancelled");
  const name = new Map(finance.partners.map((p) => [p.id, p.name]));
  const received = finance.settlement.received;
  const missing = sale ? toPesos(sale.agreed_price) - received : 0n;
  const canEdit = (membership?.role === "admin" || membership?.role === "partner") && house.stage !== "settled";

  return (
    <>
      <HouseHeader house={{ ...house, stage: house.stage as Stage }} active="venta" />
      <div className="space-y-4 md:max-w-3xl">

      {!sale ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">Registrar la venta</h2>
          {canEdit ? <SaleForm houseId={house.id} /> : <p className="text-sm text-foreground/70">Sin venta registrada.</p>}
        </Card>
      ) : (
        <Card className="space-y-2">
          <p className="text-sm text-foreground/60">Comprador</p>
          <p className="text-lg font-semibold">{sale.buyer_name}</p>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-foreground/60">Pactado</dt>
              <dd className="font-semibold">{formatPesos(toPesos(sale.agreed_price))}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">Recibido</dt>
              <dd className="font-semibold">{formatPesos(received)}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">{missing >= 0n ? "Falta" : "De más"}</dt>
              <dd className="font-semibold">{formatPesos(missing >= 0n ? missing : -missing)}</dd>
            </div>
          </dl>
          <Link href={`/casas/${house.id}/liquidacion`} className="block pt-2 text-sm font-semibold text-brand">
            Ver cómo se reparte
          </Link>
        </Card>
      )}

      {sale && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Abonos</h2>
          {(payments ?? []).length === 0 && <p className="text-sm text-foreground/70">Todavía no hay abonos.</p>}
          <ul className="divide-y divide-line text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className={`space-y-1 py-2 ${p.status === "voided" ? "opacity-60" : ""}`}>
                <div className="flex justify-between gap-2">
                  <span>
                    {toPesos(p.amount) < 0n ? "Devolución" : SOURCE_LABELS[p.source as PaymentSource]}
                    <span className="block text-xs text-foreground/60">
                      {p.paid_on} · {toPesos(p.amount) < 0n ? "devolvió" : "le llegó a"} {name.get(p.received_by_partner_id)}
                      {p.status === "voided" && ` · anulado: ${p.voided_reason}`}
                    </span>
                  </span>
                  <span className={`font-medium ${p.status === "voided" ? "line-through" : ""}`}>
                    {formatPesos(toPesos(p.amount))}
                  </span>
                </div>
                {canEdit && p.status === "active" && <VoidPaymentForm id={p.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sale && canEdit && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Registrar abono</h2>
          <PaymentForm saleId={sale.id} partners={finance.partners} today={bogotaToday()} />
        </Card>
      )}
      </div>
    </>
  );
}
