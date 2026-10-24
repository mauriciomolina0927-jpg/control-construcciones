import Link from "next/link";
import { notFound } from "next/navigation";
import { HouseHeader } from "@/components/house-header";
import { Bar, Card, Kpi } from "@/components/ui";
import { KIND_LABELS, kindOf } from "@/lib/expenses";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { PICKABLE_STAGES, STAGE_LABELS, type Stage } from "@/lib/stages";
import { changeStage } from "../actions";

export default async function HousePage({ params }: PageProps<"/casas/[id]">) {
  const { id } = await params;
  const { supabase, membership } = await requireMembership();

  const { data: house } = await supabase
    .from("houses")
    .select("id, name, address, stage, expected_price")
    .eq("id", id)
    .maybeSingle();
  if (!house) notFound();

  const expectedPrice = toPesos(house.expected_price) || null;
  const [finance, { data: expenses }, { data: sales }] = await Promise.all([
    loadHouseFinance(supabase, house.id, expectedPrice),
    supabase
      .from("expenses")
      .select("id, amount, spent_on, category, supplier_name, has_receipt, paid_by_partner_id")
      .eq("house_id", house.id)
      .eq("status", "active")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("sales").select("buyer_name, agreed_price, status").eq("house_id", house.id),
  ]);

  const { settlement, projected, partners } = finance;
  const name = new Map(partners.map((p) => [p.id, p.name]));
  const canEdit = membership?.role === "admin" || membership?.role === "partner";
  const stage = house.stage as Stage;
  const sale = (sales ?? []).find((s) => s.status !== "cancelled");
  const price = sale ? toPesos(sale.agreed_price) : expectedPrice;

  const rows = expenses ?? [];
  const byCategory = new Map<string, { total: bigint; count: number }>();
  const byKind = { lot: 0n, construction: 0n, sale_cost: 0n };
  for (const e of rows) {
    const amount = toPesos(e.amount);
    const c = byCategory.get(e.category) ?? { total: 0n, count: 0 };
    byCategory.set(e.category, { total: c.total + amount, count: c.count + 1 });
    const kind = kindOf(e.category);
    if (kind) byKind[kind] += amount;
  }
  const categories = [...byCategory].sort((a, b) => (b[1].total > a[1].total ? 1 : b[1].total < a[1].total ? -1 : 0));
  const totalSpent = byKind.lot + byKind.construction + byKind.sale_cost;
  const largest = categories[0]?.[1].total ?? 1n;

  const owed = settlement.partners.filter((p) => p.balance > 0n);
  const contributionTotal = settlement.partners.reduce((sum, p) => sum + p.contributed, 0n) || 1n;
  const partnerColors = ["bg-foreground", "bg-accent", "bg-[#a3a3a3]"];

  return (
    <>
      <HouseHeader
        house={{ ...house, stage }}
        active="resumen"
        actions={
          canEdit &&
          stage !== "settled" && (
            <>
              <form action={changeStage} className="flex items-center gap-1 rounded-full border border-line bg-white py-1 pr-1 pl-4">
                <input type="hidden" name="house_id" value={house.id} />
                <label className="sr-only" htmlFor="stage">
                  Etapa
                </label>
                <select id="stage" name="stage" defaultValue={stage} className="bg-transparent text-sm outline-none">
                  {PICKABLE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button className="rounded-full bg-soft px-3 py-1.5 text-sm font-medium">Cambiar</button>
              </form>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi
          label="Invertido"
          value={formatPesos(settlement.totalCapital)}
          foot={`Lote ${formatPesos(byKind.lot)} · obra ${formatPesos(byKind.construction)}`}
        />
        <Kpi label="Gastado en obra" value={formatPesos(byKind.construction)} foot={`${rows.length} gastos · ${finance.expensesWithoutReceipt} sin soporte`} />
        <Kpi label={sale ? "Precio pactado" : "Precio esperado"} value={price ? formatPesos(price) : "Sin definir"} foot={sale ? sale.buyer_name : "Todavía sin comprador"} />
        <Kpi
          featured
          label="Ganancia estimada"
          value={
            projected
              ? projected.capitalRecovered
                ? formatPesos(projected.totalProfit)
                : formatPesos(projected.netReceived - projected.totalCapital)
              : "Sin precio"
          }
          foot={projected ? "Si se vende a ese precio · mitad y mitad" : "Pon un precio esperado para calcularla"}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-medium">Gastos por categoría</h2>
                <p className="mt-1 text-[13px] text-foreground/60">Todo lo gastado en esta casa: {formatPesos(totalSpent)}</p>
              </div>
              <Link href={`/dinero?casa=${house.id}`} className="text-[13px] text-foreground/60">
                Ver gastos
              </Link>
            </div>
            {categories.length === 0 && <p className="text-sm text-foreground/60">Todavía no hay gastos.</p>}
            <ul className="divide-y divide-line">
              {categories.map(([category, c]) => (
                <li key={category} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category}</p>
                    <p className="text-xs text-foreground/60">
                      {KIND_LABELS[kindOf(category) ?? "construction"]} · {c.count === 1 ? "1 gasto" : `${c.count} gastos`}
                    </p>
                  </div>
                  <div className="order-last col-span-2 md:order-none md:col-span-1">
                    <Bar percent={Number((c.total * 100n) / largest)} />
                  </div>
                  <span className="text-right text-sm font-medium">{formatPesos(c.total)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-2">
            <h2 className="text-base font-medium">Últimos gastos</h2>
            <ul className="divide-y divide-line">
              {rows.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <Link href={`/dinero/${e.id}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {e.category}
                        {e.supplier_name ? ` · ${e.supplier_name}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/60">
                        {e.spent_on} · pagó {name.get(e.paid_by_partner_id) ?? "otro socio"}
                        {!e.has_receipt && <span className="text-red-600"> · sin soporte</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">{formatPesos(toPesos(e.amount))}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {rows.length === 0 && <p className="text-sm text-foreground/60">Todavía no hay gastos.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Venta</h2>
              <Link href={`/ventas/${house.id}`} className="text-[13px] text-foreground/60">
                {sale ? "Abonos" : "Registrar venta"}
              </Link>
            </div>
            {sale ? (
              <>
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-foreground/60">Pactado</p>
                    <p className="mt-0.5 text-lg font-medium tracking-tight md:text-xl">{formatPesos(toPesos(sale.agreed_price))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-foreground/60">Recibido</p>
                    <p className="mt-0.5 text-lg font-medium tracking-tight md:text-xl">{formatPesos(settlement.received)}</p>
                  </div>
                </div>
                <Bar tone="accent" percent={Number((settlement.received * 100n) / (toPesos(sale.agreed_price) || 1n))} />
                <p className="text-[13px] text-foreground/60">{sale.buyer_name}</p>
              </>
            ) : (
              <p className="text-sm text-foreground/60">Todavía sin comprador.</p>
            )}
          </Card>

          {settlement.received !== 0n && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium">Lo que nos debemos</h2>
                <Link href={`/casas/${house.id}/liquidacion`} className="text-[13px] text-foreground/60">
                  Reparto
                </Link>
              </div>
              {owed.length === 0 ? (
                <p className="text-sm text-foreground/60">Están a paz y salvo con lo recibido hasta hoy.</p>
              ) : (
                owed.map((p) => (
                  <p key={p.partnerId} className="rounded-2xl bg-[#fff0ea] px-4 py-3 text-sm font-medium text-[#c2410c]">
                    A {name.get(p.partnerId)} le deben {formatPesos(p.balance)}
                  </p>
                ))
              )}
            </Card>
          )}

          <Card className="space-y-3">
            <h2 className="text-base font-medium">Socios en esta casa</h2>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-[#efefef]">
              {settlement.partners.map((p, i) =>
                p.contributed > 0n ? (
                  <span
                    key={p.partnerId}
                    className={partnerColors[i % partnerColors.length]}
                    style={{ flexGrow: Number((p.contributed * 1000n) / contributionTotal) }}
                  />
                ) : null,
              )}
            </div>
            <ul className="space-y-2">
              {settlement.partners.map((p, i) => (
                <li key={p.partnerId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${partnerColors[i % partnerColors.length]}`} />
                    {name.get(p.partnerId)}
                  </span>
                  <span className="text-right">
                    <span className="font-medium">{formatPesos(p.contributed + p.saleCostsPaid)}</span>
                    {projected && (
                      <span className="block text-xs text-foreground/60">
                        le tocaría {formatPesos(projected.partners[i]!.entitled)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {projected && (
              <p className="text-xs text-foreground/40">
                Si se vende hoy a ese precio: cada uno recupera lo que puso y la ganancia se reparte por partes iguales.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
