"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { addPartner, invite, type FormState } from "./actions";

const selectClass =
  "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base dark:border-white/20 dark:bg-white/10";

export function AddPartnerForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addPartner, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Nombre del socio" name="name" required />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending}>Agregar socio</Button>
    </form>
  );
}

export function InviteForm({ partners }: { partners: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(invite, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Correo" name="email" type="email" inputMode="email" required />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Rol</span>
        <select name="role" defaultValue="viewer" className={selectClass}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Es el socio</span>
        <select name="partner_id" defaultValue="" className={selectClass}>
          <option value="">No es socio</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending}>Invitar</Button>
    </form>
  );
}
