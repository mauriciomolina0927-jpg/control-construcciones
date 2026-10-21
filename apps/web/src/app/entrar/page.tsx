import { Card } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

const NOTICES: Record<string, string> = {
  bloqueado: "Por seguridad bloqueamos el PIN después de 5 intentos. Entra otra vez con tu correo.",
  olvido: "Entra con tu correo y luego crea un PIN nuevo.",
  enlace: "El enlace del correo no funcionó. Pide un código nuevo.",
};

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const { motivo } = await searchParams;
  const notice = typeof motivo === "string" ? NOTICES[motivo] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-4">
      <header className="text-center">
        <h1 className="text-2xl font-bold">Control de obra</h1>
        <p className="mt-1 text-sm text-foreground/70">
          La primera vez en este celular entras con tu correo. Después, solo con tu PIN.
        </p>
      </header>
      <Card>
        <SignInForm notice={notice} />
      </Card>
    </main>
  );
}
