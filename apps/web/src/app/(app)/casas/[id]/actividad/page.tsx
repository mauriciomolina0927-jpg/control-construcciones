import Link from "next/link";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/membership";

const TABLE_LABELS: Record<string, string> = {
  houses: "Casa",
  house_agreements: "Acuerdo",
  house_agreement_partners: "Acuerdo",
  expenses: "Gasto",
  sales: "Venta",
  sale_payments: "Abono",
  partner_transfers: "Transferencia entre socios",
  attachments: "Soporte",
  settlements: "Liquidación",
  settlement_approvals: "Aprobación de liquidación",
};

const ACTION_LABELS: Record<string, string> = { insert: "creó", update: "cambió", delete: "borró" };

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

function describe(row: { table_name: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (row.table_name === "expenses" && row.action === "update" && row.after?.status === "voided") {
    return `Anuló un gasto: ${row.after?.voided_reason ?? ""}`;
  }
  if (row.table_name === "houses" && row.action === "update" && row.before?.stage !== row.after?.stage) {
    return "Cambió la etapa";
  }
  return `${ACTION_LABELS[row.action] ?? row.action} ${(TABLE_LABELS[row.table_name] ?? row.table_name).toLowerCase()}`;
}

export default async function ActivityPage({ params }: PageProps<"/casas/[id]/actividad">) {
  const { id } = await params;
  const { supabase } = await requireMembership();

  const [{ data: house }, { data: partners }, { data: log }] = await Promise.all([
    supabase.from("houses").select("name").eq("id", id).maybeSingle(),
    supabase.from("partners").select("name, user_id").not("user_id", "is", null),
    supabase
      .from("audit_log")
      .select("id, actor, action, table_name, before, after, at")
      .eq("house_id", id)
      .order("at", { ascending: false })
      .limit(100),
  ]);

  const byUser = new Map((partners ?? []).map((p) => [p.user_id, p.name]));
  const who = (actor: string | null) => (actor ? (byUser.get(actor) ?? "Administrador") : "Sistema");

  return (
    <>
      <header className="space-y-1">
        <Link href={`/casas/${id}`} className="text-sm text-brand">
          ‹ {house?.name ?? "Casa"}
        </Link>
        <h1 className="text-xl font-bold">Actividad</h1>
        <p className="text-sm text-foreground/60">Todo cambio queda registrado y no se puede borrar.</p>
      </header>
      <Card>
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {(log ?? []).map((row) => (
            <li key={row.id} className="py-2">
              <span className="first-letter:uppercase">{describe(row)}</span>
              <span className="block text-xs text-foreground/60">
                {who(row.actor)} · {dateTime.format(new Date(row.at))}
              </span>
            </li>
          ))}
          {!log?.length && <li className="py-2 text-foreground/70">Sin actividad todavía.</li>}
        </ul>
      </Card>
    </>
  );
}
