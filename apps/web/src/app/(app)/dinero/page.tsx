import Link from "next/link";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { formatPesos, toPesos } from "@/lib/money";

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "sin-soporte", label: "Sin soporte" },
  { key: "anulados", label: "Anulados" },
];

export default async function MoneyPage({ searchParams }: PageProps<"/dinero">) {
  const { casa, ver = "todos" } = await searchParams;
  const { supabase } = await requireMembership();

  let query = supabase
    .from("expenses")
    .select("id, amount, spent_on, category, supplier_name, status, has_receipt, house:houses (name), paid_by:partners (name)")
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (typeof casa === "string" && casa) query = query.eq("house_id", casa);
  if (ver === "sin-soporte") query = query.eq("status", "active").eq("has_receipt", false);
  else if (ver === "anulados") query = query.eq("status", "voided");
  else query = query.eq("status", "active");

  const [{ data: expenses }, { data: houses }] = await Promise.all([
    query,
    supabase.from("houses").select("id, name").order("created_at"),
  ]);

  type Row = NonNullable<typeof expenses>[number] & { house: { name: string } | null; paid_by: { name: string } | null };
  const rows = (expenses ?? []) as unknown as Row[];
  const total = rows.reduce((sum, e) => sum + toPesos(e.amount), 0n);
  const link = (params: Record<string, string | undefined>) => {
    const merged = { casa: typeof casa === "string" ? casa : undefined, ver: String(ver), ...params };
    const search = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
    return `/dinero?${search}`;
  };

  return (
    <>
      <h1 className="text-xl font-bold">Dinero</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href={link({ casa: undefined })} className={chip(!casa)}>
          Todas las casas
        </Link>
        {(houses ?? []).map((h) => (
          <Link key={h.id} href={link({ casa: h.id })} className={chip(casa === h.id)}>
            {h.name}
          </Link>
        ))}
      </nav>
      <nav className="flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f.key} href={link({ ver: f.key })} className={chip(ver === f.key)}>
            {f.label}
          </Link>
        ))}
      </nav>

      <Card className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{rows.length === 1 ? "1 gasto" : `${rows.length} gastos`}</h2>
          {ver !== "anulados" && <span className="text-lg font-semibold">{formatPesos(total)}</span>}
        </div>
        {rows.length === 0 && <p className="text-sm text-foreground/70">No hay gastos con este filtro.</p>}
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {rows.map((e) => (
            <li key={e.id}>
              <Link href={`/dinero/${e.id}`} className={`flex justify-between gap-2 py-2 ${e.status === "voided" ? "opacity-60" : ""}`}>
                <span>
                  {e.category}
                  {e.supplier_name ? ` · ${e.supplier_name}` : ""}
                  <span className="block text-xs text-foreground/60">
                    {e.spent_on} · {e.house?.name} · pagó {e.paid_by?.name}
                    {e.status === "active" && !e.has_receipt && (
                      <span className="text-amber-700 dark:text-amber-400"> · sin soporte</span>
                    )}
                  </span>
                </span>
                <span className={`font-medium ${e.status === "voided" ? "line-through" : ""}`}>
                  {formatPesos(toPesos(e.amount))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function chip(active: boolean) {
  return `rounded-full px-3 py-1 ${active ? "bg-brand text-white" : "bg-black/5 dark:bg-white/10"}`;
}
