"use client";

import { useActionState, useState } from "react";
import { ReceiptInput } from "@/components/receipt-input";
import { Button, Field, Message, Select } from "@/components/ui";
import { CATEGORIES, KIND_LABELS } from "@/lib/expenses";
import { createExpense, type ExpenseFormState } from "../actions";

export type HouseOption = { id: string; name: string; partners: { id: string; name: string }[] };
export type ExpenseDefaults = {
  amount?: string;
  spentOn: string;
  houseId?: string;
  category?: string;
  paidBy?: string;
  supplier?: string;
  description?: string;
  replacesId?: string;
};


/** "850000" → "850.000" while typing. */
function groupThousands(text: string) {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function ExpenseForm({
  houses,
  defaults,
  today,
}: {
  houses: HouseOption[];
  defaults: ExpenseDefaults;
  today: string;
}) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(createExpense, {});
  const [houseId, setHouseId] = useState(defaults.houseId ?? (houses.length === 1 ? houses[0]!.id : ""));
  const [paidBy, setPaidBy] = useState(defaults.paidBy ?? "");
  const [amount, setAmount] = useState(defaults.amount ? groupThousands(defaults.amount) : "");
  const [busy, setBusy] = useState(false);

  const partners = houses.find((h) => h.id === houseId)?.partners ?? [];



  return (
    <form action={action} className="space-y-4">
      {defaults.replacesId && <input type="hidden" name="replaces_id" value={defaults.replacesId} />}
      <Field
        label="Valor"
        name="amount"
        inputMode="numeric"
        placeholder="850.000"
        value={amount}
        onChange={(e) => setAmount(groupThousands(e.target.value))}
        required
        autoFocus
      />
      <Field label="Fecha" name="spent_on" type="date" defaultValue={defaults.spentOn} max={today} required />

      {houses.length === 1 ? (
        <p className="text-sm">
          Casa: <span className="font-semibold">{houses[0]!.name}</span>
          <input type="hidden" name="house_id" value={houses[0]!.id} />
        </p>
      ) : (
        <Select label="Casa" name="house_id" value={houseId} onChange={(e) => setHouseId(e.target.value)} required>
          <option value="" disabled>
            ¿A qué casa va?
          </option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      )}

      <Select label="Categoría" name="category" defaultValue={defaults.category ?? ""} required>
        <option value="" disabled>
          Elige una
        </option>
        {(["construction", "lot", "sale_cost"] as const).map((kind) => (
          <optgroup key={kind} label={KIND_LABELS[kind]}>
            {CATEGORIES.filter((c) => c.kind === kind).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">¿Quién pagó?</legend>
        {partners.length === 0 && <p className="text-sm text-foreground/70">Primero elige la casa.</p>}
        <div className="flex gap-2">
          {partners.map((p) => (
            <label
              key={p.id}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/15 px-3 py-3 has-checked:border-brand has-checked:bg-brand/10 dark:border-white/20"
            >
              <input
                type="radio"
                name="paid_by"
                value={p.id}
                checked={paidBy === p.id}
                onChange={() => setPaidBy(p.id)}
                className="sr-only"
                required
              />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Proveedor (opcional)" name="supplier" defaultValue={defaults.supplier} placeholder="Ferretería El Maestro" />
      <Field label="Nota (opcional)" name="description" defaultValue={defaults.description} />
      <ReceiptInput onBusyChange={setBusy} />

      <Message>{state.error}</Message>
      <Button disabled={pending || busy}>{pending ? "Guardando…" : busy ? "Preparando foto…" : "Guardar gasto"}</Button>
    </form>
  );
}
