"use client";

import { useActionState, useState } from "react";
import { ReceiptInput } from "@/components/receipt-input";
import { Button, Field, Message } from "@/components/ui";
import { addReceipt, voidExpense, type ActionState } from "../../gastos/actions";

export function AddReceiptForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addReceipt, {});
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <ReceiptInput onBusyChange={setBusy} />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending || busy}>{pending ? "Subiendo…" : "Guardar soporte"}</Button>
    </form>
  );
}

export function VoidForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(voidExpense, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="¿Por qué se anula?" name="reason" placeholder="Quedó repetido" required />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending} className="bg-red-700">
        Anular gasto
      </Button>
    </form>
  );
}
