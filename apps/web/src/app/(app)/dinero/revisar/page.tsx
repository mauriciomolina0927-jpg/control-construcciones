import Link from "next/link";
import { Card, Chip, Message, PageTitle } from "@/components/ui";
import { bogotaToday } from "@/lib/expenses";
import { openHouseOptions } from "@/lib/houses";
import { requireWriter } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";
import { ExpenseForm } from "../../gastos/nuevo/expense-form";
import { discardSuggestion } from "../../gastos/actions";

const NOTICES: Record<string, string> = {
  confirmado: "Gasto confirmado y guardado en la casa.",
  descartado: "Descartado. No cuenta en nada.",
  "sin-foto": "Gasto confirmado, pero la foto no se pudo guardar. Súbela desde el gasto.",
  "sin-cerrar": "Gasto guardado, pero la sugerencia sigue abierta. Descártala para no duplicarlo.",
};

const WHEN = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function ReviewPage({ searchParams }: PageProps<"/dinero/revisar">) {
  const { ver, aviso } = await searchParams;
  const ctx = await requireWriter();
  if (!ctx) {
    return (
      <Card>
        <p className="text-sm">Tu usuario solo puede consultar. Los gastos de WhatsApp los revisan Mauricio y Miguel.</p>
      </Card>
    );
  }
  const { supabase } = ctx;

  const [{ data: suggestions }, houses] = await Promise.all([
    supabase
      .from("expense_suggestions")
      .select(
        "id, message_id, amount, house_id, category, supplier_name, description, spent_on, paid_by_partner_id, missing, created_at, message:whatsapp_messages (body, has_media), paid_by:partners (name), house:houses (name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    openHouseOptions(supabase),
  ]);

  type Row = NonNullable<typeof suggestions>[number] & {
    message: { body: string | null; has_media: boolean } | null;
    paid_by: { name: string } | null;
    house: { name: string } | null;
  };
  const rows = (suggestions ?? []) as unknown as Row[];
  const selected = rows.find((r) => r.id === ver) ?? (typeof ver === "string" ? undefined : rows[0]);
  const showingDetail = typeof ver === "string" && !!selected;

  let photo: string | null = null;
  if (selected?.message?.has_media) {
    const { data: media } = await supabase
      .from("whatsapp_media")
      .select("mime_type, bytes")
      .eq("message_id", selected.message_id)
      .maybeSingle();
    if (media?.bytes && media.mime_type !== "application/pdf") {
      photo = `data:${media.mime_type};base64,${Buffer.from((media.bytes as string).replace(/^\\x/, ""), "hex").toString("base64")}`;
    }
  }
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return (
    <>
      <PageTitle title="Por revisar" subtitle="Gastos que llegaron por WhatsApp. Nada de esto cuenta hasta que lo confirmes." />
      {notice && <Message tone="info">{notice}</Message>}

      {rows.length === 0 ? (
        <Card className="items-center py-10 text-center">
          <p className="font-medium">Todo revisado</p>
          <p className="mt-1 text-sm text-foreground/60">Cuando alguien mande un gasto por WhatsApp, aparece aquí.</p>
          <Link href="/dinero" className="mt-4 inline-block text-sm text-foreground/60">
            Ver gastos
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
          <Card className={`space-y-1 p-3 ${showingDetail ? "hidden md:block" : ""}`}>
            <p className="px-2 pt-1 pb-2 text-sm text-foreground/60">{rows.length === 1 ? "1 gasto" : `${rows.length} gastos`}</p>
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dinero/revisar?ver=${r.id}`}
                    className={`flex items-center justify-between gap-3 rounded-2xl p-3 ${r.id === selected?.id ? "md:bg-soft" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{r.amount ? formatPesos(toPesos(r.amount)) : "Sin valor"}</p>
                      <p className="mt-0.5 truncate text-[13px] text-foreground/60">
                        {[r.category, r.house?.name].filter(Boolean).join(" · ") || r.message?.body || "Foto"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-xs text-foreground/60">{WHEN.format(new Date(r.created_at))}</span>
                      {r.missing.length > 0 ? (
                        <Chip tone="red">Falta {r.missing.length === 1 ? "un dato" : "datos"}</Chip>
                      ) : !r.message?.has_media ? (
                        <Chip tone="amber">Sin recibo</Chip>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {selected && (
            <Card className={`space-y-5 ${showingDetail ? "" : "hidden md:flex md:flex-col"}`}>
              <Link href="/dinero/revisar" className="text-sm text-foreground/60 md:hidden">
                ‹ Por revisar
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground/60">
                    Mensaje de {selected.paid_by?.name ?? "un socio"} · {WHEN.format(new Date(selected.created_at))}
                  </p>
                  <p className="mt-1.5 text-[15px]">“{selected.message?.body || "Solo la foto"}”</p>
                </div>
                <Chip tone="green">WhatsApp</Chip>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
                {photo ? (
                  // A data URL from our own database; next/image adds nothing here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Recibo que llegó por WhatsApp" className="max-h-96 w-full self-start rounded-2xl border border-line object-contain" />
                ) : (
                  <p className="self-start rounded-2xl bg-soft p-4 text-sm text-foreground/60">
                    {selected.message?.has_media ? "Llegó un PDF; se guarda como soporte." : "Llegó sin recibo. Puedes subir la foto aquí."}
                  </p>
                )}
                <ExpenseForm
                  key={selected.id}
                  houses={houses}
                  today={bogotaToday()}
                  defaults={{
                    suggestionId: selected.id,
                    hasWhatsappPhoto: !!selected.message?.has_media,
                    amount: selected.amount ? String(selected.amount) : undefined,
                    spentOn: selected.spent_on ?? bogotaToday(),
                    houseId: selected.house_id ?? undefined,
                    category: selected.category ?? undefined,
                    paidBy: selected.paid_by_partner_id,
                    supplier: selected.supplier_name ?? undefined,
                    description: selected.description ?? undefined,
                  }}
                />
              </div>
              <form action={discardSuggestion} className="border-t border-line pt-4">
                <input type="hidden" name="id" value={selected.id} />
                <button className="text-sm text-foreground/60">Descartar: no es un gasto o está repetido</button>
              </form>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
