"use client";

import { useActionState, useState } from "react";
import { ReceiptInput } from "@/components/receipt-input";
import { Button, Field, Message, Select } from "@/components/ui";
import { SOURCE_LABELS, type PaymentSource } from "@/lib/sales";
import { createPayment, createSale, voidPayment, type SaleFormState } from "../actions";

/** "850000" → "850.000" while typing. */
function groupThousands(text: string) {
  return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function MoneyField({ label, name }: { label: string; name: string }) {
  const [value, setValue] = useState("");
  return (
    <Field
      label={label}
      name={name}
      inputMode="numeric"
      value={value}
      onChange={(e) => setValue(groupThousands(e.target.value))}
      required
    />
  );
}

export function SaleForm({ houseId }: { houseId: string }) {
  const [state, action, pending] = useActionState<SaleFormState, FormData>(createSale, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="house_id" value={houseId} />
      <Field label="Comprador" name="buyer_name" required />
      <MoneyField label="Precio pactado" name="agreed_price" />
      <Message>{state.error}</Message>
      <Button disabled={pending}>Registrar venta</Button>
    </form>
  );
}

export function PaymentForm({
  saleId,
  partners,
  today,
}: {
  saleId: string;
  partners: { id: string; name: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<SaleFormState, FormData>(createPayment, {});
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} className="space-y-3" key={state.ok}>
      <input type="hidden" name="sale_id" value={saleId} />
      <MoneyField label="Valor" name="amount" />
      <Field label="Fecha" name="paid_on" type="date" defaultValue={today} max={today} required />
      <Select label="¿De dónde vino?" name="source" defaultValue="buyer">
        {(Object.keys(SOURCE_LABELS) as PaymentSource[]).map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </Select>
      <Select label="¿A quién le llegó?" name="received_by" defaultValue="" required>
        <option value="" disabled>
          Elige el socio
        </option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="refund" className="size-5" />
        Es una devolución al comprador
      </label>
      <ReceiptInput onBusyChange={setBusy} />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending || busy}>{pending ? "Guardando…" : "Registrar abono"}</Button>
    </form>
  );
}

export function VoidPaymentForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SaleFormState, FormData>(voidPayment, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-foreground/60">Anular</summary>
      <form action={action} className="mt-2 flex gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="reason"
          placeholder="Motivo"
          required
          className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-2 py-1"
        />
        <button disabled={pending} className="font-semibold text-red-700 dark:text-red-400">
          Anular
        </button>
      </form>
      <Message>{state.error}</Message>
    </details>
  );
}
