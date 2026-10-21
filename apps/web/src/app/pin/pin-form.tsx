"use client";

import { useActionState, useState } from "react";
import { Button, Field, Message } from "@/components/ui";
import { createPin, enterPin, forgotPin, type PinState } from "./actions";

const pinInput = {
  type: "password",
  inputMode: "numeric",
  pattern: "[0-9]{4}",
  maxLength: 4,
  autoComplete: "off",
  required: true,
  className:
    "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] dark:border-white/20 dark:bg-white/10",
} as const;

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [mode, setMode] = useState<"enter" | "create">(hasPin ? "enter" : "create");

  return (
    <div className="space-y-4">
      {mode === "enter" ? <EnterPin /> : <CreatePin />}
      {hasPin && (
        <div className="flex justify-between text-sm">
          <form action={forgotPin}>
            <button className="text-brand underline">Olvidé mi PIN</button>
          </form>
          <button type="button" className="text-brand underline" onClick={() => setMode(mode === "enter" ? "create" : "enter")}>
            {mode === "enter" ? "Cambiar PIN" : "Ya tengo PIN"}
          </button>
        </div>
      )}
    </div>
  );
}

function EnterPin() {
  const [state, action, pending] = useActionState<PinState, FormData>(enterPin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Tu PIN" name="pin" autoFocus {...pinInput} />
      <Message>{state.error}</Message>
      <Button disabled={pending}>Entrar</Button>
    </form>
  );
}

function CreatePin() {
  const [state, action, pending] = useActionState<PinState, FormData>(createPin, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Crea un PIN de 4 números" name="pin" autoFocus {...pinInput} />
      <Field label="Repite el PIN" name="confirm" {...pinInput} />
      <Message>{state.error}</Message>
      <Button disabled={pending}>Guardar PIN</Button>
    </form>
  );
}
