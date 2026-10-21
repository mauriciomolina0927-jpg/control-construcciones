import { notFound } from "next/navigation";
import { HouseHeader } from "@/components/house-header";
import { Card } from "@/components/ui";
import { bogotaToday } from "@/lib/expenses";
import { loadHouseFinance } from "@/lib/houses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { suggestTransfers } from "@/lib/sales";
import type { Stage } from "@/lib/stages";
import { ApproveForm, CreateSettlementForm, TransferForm, VoidTransferForm } from "./forms";

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export default async function SettlementPage({ params }: PageProps<"/casas/[id]/liquidacion">) {
  const { id } = await params;
  const { supabase, membership, user } = await requireMembership();

  const { data: house } = await supabase.from("houses").select("id, name, stage").eq("id", id).maybeSingle();
  if (!house) notFound();

  const [finance, { data: transfers }, { data: latest }] = await Promise.all([
    loadHouseFinance(supabase, id, null),
    supabase
      .from("partner_transfers")
      .select("id, amount, transferred_on, from_partner_id, to_partner_id, status, voided_reason")
      .eq("house_id", id)
      .order("transferred_on", { ascending: false }),
    supabase
      .from("settlements")
      .select("id, version, hash, created_at, settlement_approvals (partner_id, approved_at)")
      .eq("house_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { settlement: s, partners } = finance;
  const name = new Map(partners.map((p) => [p.id, p.name]));
  const me = partners.find((p) => p.userId === user.id);
  const canEdit = (membership?.role === "admin" || membership?.role === "partner") && house.stage !== "settled";
  const settled = house.stage === "settled";
  const today = bogotaToday();
  const suggestions = suggestTransfers(s.partners);
  const shortfall = s.totalCapital - s.netReceived;

  // A settlement is outdated when money moved after it was generated.
  let outdated = false;
  if (latest && !settled) {
    const { data: moved } = await supabase
      .from("audit_log")
      .select("id")
      .eq("house_id", id)
      .in("table_name", ["expenses", "sales", "sale_payments", "partner_transfers"])
      .gt("at", latest.created_at)
      .limit(1);
    outdated = (moved ?? []).length > 0;
  }
  const approvals = new Map(
    ((latest?.settlement_approvals ?? []) as { partner_id: string; approved_at: string }[]).map((a) => [a.partner_id, a.approved_at]),
  );
  const square = s.partners.every((p) => p.balance === 0n);
  const disabledReason =
    s.received <= 0n
      ? "Se genera cuando haya plata recibida de la venta."
      : !square
        ? "Primero registren los traslados de arriba hasta quedar a paz y salvo."
        : latest && !outdated
          ? "Ya hay una liquidación vigente esperando aprobación."
          : undefined;

  return (
    <>
      <HouseHeader house={{ ...house, stage: house.stage as Stage }} active="reparto" />
      <p className="text-sm text-foreground/60">Cómo se reparte la plata recibida hasta hoy: {formatPesos(s.received)}.</p>
      <div className="space-y-4 md:max-w-3xl">

      <Card className="space-y-4 text-sm">
        <Step n={1} title="Se devuelven los gastos de venta a quien los pagó" total={s.partners.reduce((a, p) => a + p.saleCostsReimbursed, 0n)}>
          {s.totalSaleCosts === 0n
            ? "No hubo gastos de venta."
            : s.partners
                .filter((p) => p.saleCostsPaid > 0n)
                .map((p) => `${name.get(p.partnerId)}: ${formatPesos(p.saleCostsReimbursed)} de ${formatPesos(p.saleCostsPaid)}`)
                .join(" · ")}
        </Step>
        <Step n={2} title="Cada uno recupera lo que puso" total={s.partners.reduce((a, p) => a + p.capitalReturned, 0n)}>
          {s.partners.map((p) => `${name.get(p.partnerId)}: ${formatPesos(p.capitalReturned)} de ${formatPesos(p.contributed)}`).join(" · ")}
        </Step>
        <Step n={3} title="La utilidad se reparte por partes iguales" total={s.totalProfit}>
          {s.capitalRecovered
            ? s.partners.map((p) => `${name.get(p.partnerId)}: ${formatPesos(p.profit)}`).join(" · ")
            : `Todavía no hay utilidad: faltan ${formatPesos(shortfall)} para devolver todo lo que pusieron.`}
        </Step>

        <table className="w-full">
          <thead className="text-left text-foreground/60">
            <tr>
              <th className="pb-2 font-normal">Socio</th>
              <th className="pb-2 text-right font-normal">Le toca</th>
              <th className="pb-2 text-right font-normal">Ya tiene</th>
            </tr>
          </thead>
          <tbody>
            {s.partners.map((p) => (
              <tr key={p.partnerId} className="border-t border-black/5 dark:border-white/10">
                <td className="py-2">{name.get(p.partnerId)}</td>
                <td className="py-2 text-right font-semibold">{formatPesos(p.entitled)}</td>
                <td className="py-2 text-right">{formatPesos(p.held)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {settled ? null : !s.capitalRecovered && s.received > 0n ? (
          <p className="text-xs text-foreground/60">
            Si la casa se cierra así, la diferencia se asume en proporción a lo que puso cada uno.
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Lo que nos debemos</h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-foreground/70">Están a paz y salvo con lo recibido hasta hoy.</p>
        ) : (
          suggestions.map((t) => {
            const label = `${name.get(t.from)} le debe pasar ${formatPesos(t.amount)} a ${name.get(t.to)}`;
            return canEdit ? (
              <TransferForm
                key={`${t.from}-${t.to}`}
                houseId={id}
                from={t.from}
                to={t.to}
                label={label}
                amount={t.amount.toString()}
                today={today}
              />
            ) : (
              <p key={`${t.from}-${t.to}`} className="text-sm">
                {label}.
              </p>
            );
          })
        )}
        {(transfers ?? []).length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {(transfers ?? []).map((t) => (
              <li key={t.id} className={`space-y-1 py-2 ${t.status === "voided" ? "opacity-60" : ""}`}>
                <div className="flex justify-between gap-2">
                  <span>
                    {name.get(t.from_partner_id)} le pasó a {name.get(t.to_partner_id)}
                    <span className="block text-xs text-foreground/60">
                      {t.transferred_on}
                      {t.status === "voided" && ` · anulado: ${t.voided_reason}`}
                    </span>
                  </span>
                  <span className={t.status === "voided" ? "line-through" : "font-medium"}>{formatPesos(toPesos(t.amount))}</span>
                </div>
                {canEdit && t.status === "active" && <VoidTransferForm id={t.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Liquidación final</h2>
        {settled && <p className="text-sm font-semibold text-green-700 dark:text-green-400">Casa liquidada. No recibe más movimientos.</p>}
        {latest ? (
          <div className="space-y-2 text-sm">
            <p>
              Versión {latest.version} · {dateTime.format(new Date(latest.created_at))}
              <span className="block font-mono text-xs text-foreground/60">Huella {latest.hash.slice(0, 16)}</span>
            </p>
            {outdated && (
              <p className="text-amber-700 dark:text-amber-400">
                Hubo movimientos después de generarla; ya no vale. Hay que generar una nueva.
              </p>
            )}
            <ul className="space-y-1">
              {partners.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className={approvals.has(p.id) ? "text-green-700 dark:text-green-400" : "text-foreground/60"}>
                    {approvals.has(p.id) ? `Aprobó ${dateTime.format(new Date(approvals.get(p.id)!))}` : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
            {me && !settled && !outdated && !approvals.has(me.id) && (
              <ApproveForm houseId={id} settlementId={latest.id} />
            )}
          </div>
        ) : (
          !settled && (
            <p className="text-sm text-foreground/70">
              Cuando la plata de la venta esté repartida, Mauricio la genera y cada socio la aprueba con su PIN. Al aprobar
              todos, la casa queda cerrada.
            </p>
          )
        )}
        {membership?.role === "admin" && !settled && <CreateSettlementForm houseId={id} disabledReason={disabledReason} />}
      </Card>
      </div>
    </>
  );
}

function Step({ n, title, total, children }: { n: number; title: string; total: bigint; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-medium">{n}</span>
      <div className="flex-1">
        <p className="flex justify-between gap-2 font-medium">
          <span>{title}</span>
          <span>{formatPesos(total)}</span>
        </p>
        <p className="text-foreground/70">{children}</p>
      </div>
    </div>
  );
}
