"use client";

import { useActionState } from "react";
import { MIN_PASSWORD } from "@/app/entrar/password";
import { Button, Field, Message } from "@/components/ui";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <Field
        label={`Contraseña nueva (mínimo ${MIN_PASSWORD} caracteres)`}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
      />
      <Field label="Repite la contraseña" name="repeat" type="password" autoComplete="new-password" required />
      <Message>{state.error}</Message>
      <Message tone="info">{state.ok}</Message>
      <Button disabled={pending}>Guardar contraseña</Button>
    </form>
  );
}
