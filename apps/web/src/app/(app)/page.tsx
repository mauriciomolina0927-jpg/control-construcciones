import Link from "next/link";
import { StageChip } from "@/components/stage-chip";
import { Card, Chip, Kpi, LinkButton, PageTitle } from "@/components/ui";
import { bogotaGreeting, bogotaToday, spentByMonth } from "@/lib/expenses";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatMillions, formatPesos, toPesos } from "@/lib/money";
import type { Stage } from "@/lib/stages";

const LONG_DATE = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" });

export default async function HomePage() {
  const { supabase, membership, user } = await requireMembership();
  const today = bogotaToday();
  const months = spentByMonth([], today);

  // Explicit foreign keys: sale_payments links houses and sales, so "sales" alone would be ambiguous.
  const [{ data: houses }, { data: expenses }, { data: me }, { count: toReview }] = await Promise.all([
    supabase
      .from("houses")
      .select(
        "id, name, stage, expected_price, sales!sales_organization_id_house_id_fkey (agreed_price, status), sale_payments!sale_payments_organization_id_house_id_fkey (amount, status)",
      )
      .neq("stage", "settled")
      .order("created_at"),
    supabase
      .from("expenses")
      .select("id, amount, spent_on, category, supplier_name, has_receipt, house:houses (name), paid_by:partners (name)")
      .eq("status", "active")
      .gte("spent_on", `${months[0]!.key}-01`)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("partners").select("name").eq("user_id", user.id).maybeSingle(),
    supabase.from("expense_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  type HouseRow = {
    id: string;
    name: string;
    stage: Stage;
    expected_price: number | null;
    sales: { agreed_price: number; status: string }[];
    sale_payments: { amount: number; status: string }[];
  };
  const rows = await Promise.all(
    ((houses ?? []) as unknown as HouseRow[]).map(async (h) => {
      const finance = await loadHouseFinance(supabase, h.id, toPesos(h.expected_price) || null);
      const sale = h.sales.find((s) => s.status !== "cancelled");
      const received = h.sale_payments.filter((p) => p.status === "active").reduce((sum, p) => sum + toPesos(p.amount), 0n);
      const toCollect = sale ? toPesos(sale.agreed_price) - received : 0n;
      return { ...h, finance, price: sale ? toPesos(sale.agreed_price) : toPesos(h.expected_price), toCollect };
    }),
  );

  type ExpenseRow = NonNullable<typeof expenses>[number] & { house: { name: string } | null; paid_by: { name: string } | null };
  const spent = (expenses ?? []) as unknown as ExpenseRow[];
  const byMonth = spentByMonth(
    spent.map((e) => ({ amount: toPesos(e.amount), spentOn: e.spent_on })),
    today,
  );
  const thisMonth = byMonth.at(-1)!;
  const thisMonthCount = spent.filter((e) => e.spent_on.startsWith(thisMonth.key)).length;
  const tallest = byMonth.reduce((max, m) => (m.total > max ? m.total : max), 1n);

  const capital = rows.reduce((sum, r) => sum + r.finance.settlement.totalCapital, 0n);
  const byPartner = new Map<string, bigint>();
  for (const r of rows) {
    const name = new Map(r.finance.partners.map((p) => [p.id, p.name]));
    for (const p of r.finance.settlement.partners) {
      const key = name.get(p.partnerId) ?? "Otro";
      byPartner.set(key, (byPartner.get(key) ?? 0n) + p.contributed);
    }
  }
  const withoutReceipt = rows.reduce((sum, r) => sum + r.finance.expensesWithoutReceipt, 0);
  const toCollect = rows.reduce((sum, r) => sum + (r.toCollect > 0n ? r.toCollect : 0n), 0n);

  type Attention = { key: string; tone: "red" | "accent"; title: string; detail: string; href: string; action: string };
  const attention: Attention[] = [];
  if (toReview) {
    attention.push({
      key: "whatsapp",
      tone: "accent",
      title: toReview === 1 ? "1 gasto de WhatsApp por revisar" : `${toReview} gastos de WhatsApp por revisar`,
      detail: "No cuentan hasta que los confirmes",
      href: "/dinero/revisar",
      action: "Revisar",
    });
  }
  for (const r of rows) {
    const name = new Map(r.finance.partners.map((p) => [p.id, p.name]));
    if (r.finance.expensesWithoutReceipt > 0) {
      const n = r.finance.expensesWithoutReceipt;
      attention.push({
        key: `${r.id}-receipts`,
        tone: "red",
        title: n === 1 ? "1 gasto sin soporte" : `${n} gastos sin soporte`,
        detail: r.name,
        href: `/dinero?casa=${r.id}&ver=sin-soporte`,
        action: "Subir fotos",
      });
    }
    for (const p of r.finance.settlement.partners.filter((p) => p.balance > 0n)) {
      attention.push({
        key: `${r.id}-${p.partnerId}`,
        tone: "accent",
        title: `A ${name.get(p.partnerId)} le deben ${formatPesos(p.balance)}`,
        detail: `${r.name} · plata de la venta`,
        href: `/casas/${r.id}/liquidacion`,
        action: "Ver reparto",
      });
    }
  }

  const firstName = me?.name.split(" ")[0];
  const date = LONG_DATE.format(new Date());
  const canRegister = membership?.role === "admin" || membership?.role === "partner";

  return (
    <>
      <PageTitle
        title={firstName ? `${bogotaGreeting()}, ${firstName}` : bogotaGreeting()}
        subtitle={`${date.charAt(0).toUpperCase()}${date.slice(1)} · así van las casas hoy.`}
        actions={
          canRegister && (
            <span className="hidden md:block">
              <LinkButton href="/ventas" tone="secondary">
                Registrar abono
              </LinkButton>
            </span>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="col-span-2 md:col-span-1">
          <Kpi
            featured
            label="Capital en las casas"
            value={formatPesos(capital)}
            foot={[...byPartner].map(([n, v]) => `${n} ${formatPesos(v)}`).join(" · ") || "Sin aportes todavía"}
          />
        </div>
        <Kpi label="Gastado este mes" value={formatPesos(thisMonth.total)} foot={thisMonthCount === 1 ? "1 gasto" : `${thisMonthCount} gastos`} />
        <Kpi label="Gastos sin soporte" value={String(withoutReceipt)} foot={withoutReceipt ? "Falta la foto del recibo" : "Todo con soporte"} />
        <div className="col-span-2 md:col-span-1">
          <Kpi label="Por cobrar a compradores" value={formatPesos(toCollect)} foot="Precio pactado menos lo recibido" />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Casas</h2>
            {membership?.role === "admin" && (
              <Link href="/casas/nueva" className="text-[13px] text-foreground/60">
                + Nueva casa
              </Link>
            )}
          </div>
          {rows.length === 0 && <p className="py-2 text-sm text-foreground/60">Todavía no hay casas activas.</p>}
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/casas/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1fr)_minmax(0,1fr)_12px]">
                  <span className="font-medium">{r.name}</span>
                  <span className="justify-self-end md:justify-self-start">
                    <StageChip stage={r.stage} />
                  </span>
                  <span className="text-sm text-foreground/60 md:text-foreground">
                    <span className="md:hidden">Invertido </span>
                    {formatPesos(r.finance.settlement.totalCapital)}
                  </span>
                  <span className="justify-self-end text-sm text-foreground/60 md:justify-self-start">
                    {r.price > 0n ? `Precio ${formatPesos(r.price)}` : "Sin precio"}
                  </span>
                  <span aria-hidden="true" className="hidden text-foreground/30 md:block">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-1">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-medium">Requiere atención</h2>
            {attention.length > 0 && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-white">{attention.length}</span>
            )}
          </div>
          {attention.length === 0 && <p className="text-sm text-foreground/60">Nada pendiente por ahora.</p>}
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.key} className="flex items-start gap-3 py-3">
                <span className={`mt-2 size-1.5 shrink-0 rounded-full ${a.tone === "red" ? "bg-red-600" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-0.5 text-[13px] text-foreground/60">{a.detail}</p>
                </div>
                <Link href={a.href} className="text-[13px] font-medium">
                  {a.action}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-medium">Gastos por mes</h2>
            <p className="mt-1 text-[13px] text-foreground/60">Todas las casas</p>
          </div>
          <div className="flex h-48 items-end gap-3">
            {byMonth.map((m, i) => {
              const current = i === byMonth.length - 1;
              return (
                <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className={`text-[11px] ${current ? "font-medium" : "text-foreground/40"}`}>
                    {m.total > 0n ? formatMillions(m.total).replace("$ ", "").replace(" M", "") : ""}
                  </span>
                  <div
                    className={`w-full max-w-11 rounded-[10px] ${
                      current ? "bg-[repeating-linear-gradient(135deg,var(--accent)_0_4px,#ff9a73_4px_8px)]" : "bg-foreground"
                    }`}
                    style={{ height: `${Math.max(2, Number((m.total * 100n) / tallest))}%` }}
                  />
                  <span className="text-xs text-foreground/60">{m.label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-foreground/40">En millones de pesos</p>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Últimos gastos</h2>
            <Link href="/dinero" className="text-[13px] text-foreground/60">
              Ver todo
            </Link>
          </div>
          {spent.length === 0 && <p className="py-2 text-sm text-foreground/60">No hay gastos en los últimos meses.</p>}
          <ul className="divide-y divide-line">
            {spent.slice(0, 5).map((e) => (
              <li key={e.id}>
                <Link href={`/dinero/${e.id}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {e.category}
                      {e.supplier_name ? ` · ${e.supplier_name}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/60">
                      {e.spent_on} · {e.house?.name} · pagó {e.paid_by?.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium">{formatPesos(toPesos(e.amount))}</span>
                    <span className="hidden md:inline">
                      {e.has_receipt ? <Chip tone="green">Con soporte</Chip> : <Chip tone="red">Sin soporte</Chip>}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
