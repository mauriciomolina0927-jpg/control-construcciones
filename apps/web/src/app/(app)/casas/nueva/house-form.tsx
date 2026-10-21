"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/ui";
import { PICKABLE_STAGES, STAGE_LABELS } from "@/lib/stages";
import { createHouse, type HouseFormState } from "../actions";

export function HouseForm({ partners }: { partners: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<HouseFormState, FormData>(createHouse, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre" name="name" placeholder="Casa Los Robles" required />
      <Field label="Dirección (opcional)" name="address" />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Etapa</span>
        <select
          name="stage"
          defaultValue="lot"
          className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base dark:border-white/20 dark:bg-white/10"
        >
          {PICKABLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <Field label="Precio de venta esperado (opcional)" name="expected_price" inputMode="numeric" placeholder="215.000.000" />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Socios de esta casa (la utilidad se reparte por partes iguales)</legend>
        {partners.map((p) => (
          <label key={p.id} className="flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
            <input type="checkbox" name="partner_id" value={p.id} defaultChecked className="size-5" />
            {p.name}
          </label>
        ))}
        {partners.length === 0 && (
          <p className="text-sm text-foreground/70">Primero agrega los socios en Más › Socios e invitaciones.</p>
        )}
      </fieldset>
      <Message>{state.error}</Message>
      <Button disabled={pending || partners.length === 0}>Crear casa</Button>
    </form>
  );
}
