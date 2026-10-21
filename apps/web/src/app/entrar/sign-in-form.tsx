"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/ui";
import { signInStep, type SignInMode, type SignInState } from "./actions";
import { MIN_PASSWORD } from "./password";

const SUBMIT: Record<SignInMode, string> = {
  password: "Entrar",
  create: "Crear contraseña y entrar",
  link: "Enviarme el enlace",
};

function ModeLink({ mode, children }: { mode: SignInMode; children: string }) {
  return (
    <button name="mode" value={mode} className="w-full text-sm text-brand underline" formNoValidate>
      {children}
    </button>
  );
}

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInStep, { mode: "password", email: "" });

  return (
    <form action={action} className="space-y-4">
      <Field
        key={state.mode}
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.email}
        required
      />
      {state.mode !== "link" && (
        <Field
          label={state.mode === "create" ? `Contraseña nueva (mínimo ${MIN_PASSWORD} caracteres)` : "Contraseña"}
          name="password"
          type="password"
          autoComplete={state.mode === "create" ? "new-password" : "current-password"}
          minLength={state.mode === "create" ? MIN_PASSWORD : undefined}
          required
        />
      )}
      {state.mode === "create" && (
        <Field label="Repite la contraseña" name="repeat" type="password" autoComplete="new-password" required />
      )}
      <Message tone="info">{state.info}</Message>
      <Message>{state.error ?? notice}</Message>
      <Button disabled={pending}>{SUBMIT[state.mode]}</Button>
      <div className="space-y-2">
        {state.mode !== "create" && <ModeLink mode="create">Es mi primera vez: crear contraseña</ModeLink>}
        {state.mode !== "password" && <ModeLink mode="password">Ya tengo contraseña</ModeLink>}
        {state.mode !== "link" && <ModeLink mode="link">Entrar con un enlace al correo</ModeLink>}
      </div>
    </form>
  );
}
