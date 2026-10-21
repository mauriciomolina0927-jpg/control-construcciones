"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/ui";
import {
  approveSettlement,
  createSettlement,
  createTransfer,
  voidTransfer,
  type SettleState,
} from "./actions";

export function TransferForm({
  houseId,
  from,
  to,
  label,
  amount,
  today,
}: {
  houseId: string;
  from: string;
  to: string;
  label: string;
  amount: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<SettleState, FormData>(createTransfer, {});
  return (
    <form action={action} className="space-y-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-medium">{label}</p>
      <input type="hidden" name="house_id" value={houseId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor" name="amount" inputMode="numeric" defaultValue={amount} required />
        <Field label="Fecha" name="transferred_on" type="date" defaultValue={today} max={today} required />
      </div>
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending}>Ya se lo pasó</Button>
    </form>
  );
}

export function VoidTransferForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SettleState, FormData>(voidTransfer, {});
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

export function CreateSettlementForm({ houseId, disabledReason }: { houseId: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState<SettleState, FormData>(createSettlement, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="house_id" value={houseId} />
      {disabledReason && <p className="text-sm text-foreground/70">{disabledReason}</p>}
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending || !!disabledReason}>Generar liquidación final</Button>
    </form>
  );
}

export function ApproveForm({ houseId, settlementId }: { houseId: string; settlementId: string }) {
  const [state, action, pending] = useActionState<SettleState, FormData>(approveSettlement, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="house_id" value={houseId} />
      <input type="hidden" name="settlement_id" value={settlementId} />
      <Field
        label="Si estás de acuerdo, escribe tu PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="off"
        required
      />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending}>Aprobar liquidación</Button>
    </form>
  );
}
