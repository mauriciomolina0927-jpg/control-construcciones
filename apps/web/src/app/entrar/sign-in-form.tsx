"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/ui";
import { signInStep, type SignInState } from "./actions";

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInStep, { step: "email", email: "" });

  return (
    <form action={action} className="space-y-4">
      {state.step === "email" ? (
        <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required />
      ) : (
        <>
          <Message tone="info">{state.info}</Message>
          <Field
            label="Código del correo"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            required
            autoFocus
          />
        </>
      )}
      <Message>{state.error ?? (state.step === "email" ? notice : undefined)}</Message>
      <Button disabled={pending}>{state.step === "email" ? "Enviarme un código" : "Entrar"}</Button>
      {state.step === "code" && (
        <button name="restart" value="1" className="w-full text-sm text-brand underline" formNoValidate>
          Usar otro correo
        </button>
      )}
    </form>
  );
}
