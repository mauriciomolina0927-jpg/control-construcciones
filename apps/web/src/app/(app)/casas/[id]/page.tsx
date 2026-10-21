import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
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
  const [finance, { data: recent }] = await Promise.all([
    loadHouseFinance(supabase, house.id, expectedPrice),
    supabase
      .from("expenses")
      .select("id, amount, spent_on, category, supplier_name, status, has_receipt, paid_by_partner_id")
      .eq("house_id", house.id)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const { settlement, projected, partners } = finance;
  const name = new Map(partners.map((p) => [p.id, p.name]));
  const canEdit = membership?.role === "admin" || membership?.role === "partner";
  const owes = settlement.partners.filter((p) => p.balance !== 0n);

  return (
    <>
      <header className="space-y-1">
        <Link href="/casas" className="text-sm text-brand">
          ‹ Casas
        </Link>
        <h1 className="text-xl font-bold">{house.name}</h1>
        {house.address && <p className="text-sm text-foreground/60">{house.address}</p>}
      </header>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground/60">Etapa</span>
          {canEdit && house.stage !== "settled" ? (
            <form action={changeStage} className="flex gap-2">
              <input type="hidden" name="house_id" value={house.id} />
              <select name="stage" defaultValue={house.stage} className="rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm">
                {PICKABLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
              <button className="text-sm font-semibold text-brand">Cambiar</button>
            </form>
          ) : (
            <span className="font-semibold">{STAGE_LABELS[house.stage as Stage]}</span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-foreground/60">Capital invertido</dt>
            <dd className="text-lg font-semibold">{formatPesos(settlement.totalCapital)}</dd>
          </div>
          <div>
            <dt className="text-foreground/60">Precio esperado</dt>
            <dd className="text-lg font-semibold">{expectedPrice ? formatPesos(expectedPrice) : "Sin definir"}</dd>
          </div>
          {projected && (
            <div className="col-span-2">
              <dt className="text-foreground/60">Utilidad si se vende a ese precio</dt>
              <dd className={`text-lg font-semibold ${projected.totalProfit > 0n ? "text-green-700 dark:text-green-400" : ""}`}>
                {projected.capitalRecovered
                  ? formatPesos(projected.totalProfit)
                  : `Pérdida de ${formatPesos(projected.totalCapital - projected.netReceived)}`}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Lo que ha puesto cada uno</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-foreground/60">
            <tr>
              <th className="pb-2 font-normal">Socio</th>
              <th className="pb-2 text-right font-normal">Ha puesto</th>
              {projected && <th className="pb-2 text-right font-normal">Le tocaría</th>}
            </tr>
          </thead>
          <tbody>
            {settlement.partners.map((p, i) => (
              <tr key={p.partnerId} className="border-t border-black/5 dark:border-white/10">
                <td className="py-2">{name.get(p.partnerId)}</td>
                <td className="py-2 text-right">{formatPesos(p.contributed + p.saleCostsPaid)}</td>
                {projected && <td className="py-2 text-right">{formatPesos(projected.partners[i]!.entitled)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {projected && (
          <p className="text-xs text-foreground/60">
            &quot;Le tocaría&quot; es lo que recibiría cada uno si la casa se vende hoy al precio esperado: primero recupera lo
            que puso y la utilidad se reparte por partes iguales.
          </p>
        )}
      </Card>

      {settlement.received !== 0n && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Lo que nos debemos</h2>
          {owes.length === 0 ? (
            <p className="text-sm text-foreground/70">Están a paz y salvo con lo recibido hasta hoy.</p>
          ) : (
            owes
              .filter((p) => p.balance > 0n)
              .map((p) => (
                <p key={p.partnerId} className="text-sm">
                  A {name.get(p.partnerId)} le deben {formatPesos(p.balance)}.
                </p>
              ))
          )}
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Últimos gastos</h2>
          <span className="flex gap-3 text-sm">
            <Link href={`/dinero?casa=${house.id}`} className="text-brand">
              Ver todos
            </Link>
            <Link href={`/casas/${house.id}/actividad`} className="text-brand">
              Actividad
            </Link>
          </span>
        </div>
        {(recent ?? []).length === 0 && <p className="text-sm text-foreground/70">Todavía no hay gastos.</p>}
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {(recent ?? []).map((e) => (
            <li key={e.id}>
              <Link href={`/dinero/${e.id}`} className={`flex justify-between gap-2 py-2 ${e.status === "voided" ? "line-through opacity-50" : ""}`}>
              <span>
                {e.category}
                {e.supplier_name ? ` · ${e.supplier_name}` : ""}
                <span className="block text-xs text-foreground/60">
                  {e.spent_on} · pagó {name.get(e.paid_by_partner_id) ?? "otro socio"}
                  {!e.has_receipt && e.status === "active" ? " · sin soporte" : ""}
                </span>
              </span>
              <span className="font-medium">{formatPesos(toPesos(e.amount))}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
