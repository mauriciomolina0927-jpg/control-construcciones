import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { PinForm } from "./pin-form";

export default async function PinPage() {
  const supabase = await createClient();
  const { data: hasPin } = await supabase.rpc("has_pin");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-4">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{hasPin ? "Escribe tu PIN" : "Crea tu PIN"}</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {hasPin
            ? "Lo pedimos al abrir la app y después de 15 minutos sin usarla."
            : "Con este PIN entrarás de ahora en adelante en este celular."}
        </p>
      </header>
      <Card>
        <PinForm hasPin={Boolean(hasPin)} />
      </Card>
    </main>
  );
}
