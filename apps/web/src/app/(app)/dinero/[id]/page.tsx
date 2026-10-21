import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Message } from "@/components/ui";
import { KIND_LABELS, type ExpenseKind } from "@/lib/expenses";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { AddReceiptForm, VoidForm } from "./forms";

const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  guardado: { tone: "info", text: "Gasto guardado." },
  "sin-foto": { tone: "error", text: "El gasto quedó guardado, pero la foto no subió. Agrégala abajo." },
};

export default async function ExpensePage({ params, searchParams }: PageProps<"/dinero/[id]">) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const { supabase, membership } = await requireMembership();

  const { data: e } = await supabase
    .from("expenses")
    .select(
      "id, amount, spent_on, kind, category, supplier_name, description, status, voided_reason, has_receipt, replaces_id, created_at, house:houses (id, name, stage), paid_by:partners (name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const [{ data: files }, { data: correction }] = await Promise.all([
    supabase.from("attachments").select("storage_path, mime_type").eq("owner_type", "expense").eq("owner_id", id).order("created_at"),
    supabase.from("expenses").select("id").eq("replaces_id", id).maybeSingle(),
  ]);
  const receipts = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await supabase.storage.from("receipts").createSignedUrl(f.storage_path, 10 * 60);
      return { url: data?.signedUrl, mime: f.mime_type as string };
    }),
  );

  const house = e.house as unknown as { id: string; name: string; stage: string };
  const paidBy = e.paid_by as unknown as { name: string } | null;
  const canEdit = (membership?.role === "admin" || membership?.role === "partner") && house.stage !== "settled";
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return (
    <>
      <header className="space-y-1">
        <Link href="/dinero" className="text-sm text-brand">
          ‹ Dinero
        </Link>
        <h1 className="text-xl font-bold">{e.category}</h1>
        {notice && <Message tone={notice.tone}>{notice.text}</Message>}
        {aviso === "guardado" && (
          <Link href="/gastos/nuevo" className="inline-block text-sm font-semibold text-brand">
            Registrar otro gasto
          </Link>
        )}
      </header>

      <Card className="space-y-3">
        {e.status === "voided" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            Anulado: {e.voided_reason}
            {correction && (
              <>
                {" · "}
                <Link href={`/dinero/${correction.id}`} className="font-semibold underline">
                  Ver el correcto
                </Link>
              </>
            )}
          </p>
        )}
        <p className={`text-2xl font-bold ${e.status === "voided" ? "line-through opacity-60" : ""}`}>
          {formatPesos(toPesos(e.amount))}
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Item label="Casa">
            <Link href={`/casas/${house.id}`} className="text-brand">
              {house.name}
            </Link>
          </Item>
          <Item label="Fecha">{e.spent_on}</Item>
          <Item label="Pagó">{paidBy?.name}</Item>
          <Item label="Tipo">{KIND_LABELS[e.kind as ExpenseKind]}</Item>
          {e.supplier_name && <Item label="Proveedor">{e.supplier_name}</Item>}
          {e.description && <Item label="Nota">{e.description}</Item>}
        </dl>
        {e.replaces_id && (
          <Link href={`/dinero/${e.replaces_id}`} className="block text-sm text-brand">
            Corrige un gasto anterior
          </Link>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Soporte</h2>
        {receipts.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-400">Este gasto no tiene soporte.</p>}
        {receipts.map((r, i) =>
          !r.url ? null : r.mime === "application/pdf" ? (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand">
              Abrir PDF
            </a>
          ) : (
            <a key={i} href={r.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
              <img src={r.url} alt="Foto del soporte" className="max-h-96 w-full rounded-xl object-contain" />
            </a>
          ),
        )}
        {canEdit && e.status === "active" && !e.has_receipt && <AddReceiptForm id={e.id} />}
      </Card>

      {canEdit && e.status === "active" && (
        <Card className="space-y-4">
          <h2 className="font-semibold">¿Algo está mal?</h2>
          <p className="text-sm text-foreground/70">
            Los gastos no se editan ni se borran: se anulan y queda el registro. Si el valor, la casa o quien pagó están mal,
            registra el correcto y este se anula solo.
          </p>
          <Link
            href={`/gastos/nuevo?reemplaza=${e.id}`}
            className="block rounded-xl border border-brand px-4 py-3 text-center font-semibold text-brand"
          >
            Registrar el correcto
          </Link>
          <VoidForm id={e.id} />
        </Card>
      )}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-foreground/60">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
