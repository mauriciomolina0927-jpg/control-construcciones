import type { Metadata } from "next";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Política de privacidad · Control de obra" };

// Public page: Meta asks for a privacy policy URL before the WhatsApp app can go live.
// The legal wording under Colombian law (Ley 1581 de 2012) is still "por verificar".
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-bold">Política de privacidad</h1>
        <p className="mt-1 text-sm text-foreground/70">Control de obra · Actualizada el 21 de octubre de 2026</p>
      </header>
      <Card>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold">Quiénes somos</h2>
            <p>
              Control de obra es una herramienta privada de un negocio familiar de construcción en Atlántico, Colombia.
              Solo la usan los socios del negocio. No está abierta al público ni se usa para escribirle a clientes.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Qué datos guardamos</h2>
            <p>
              El nombre, correo y número de WhatsApp de cada socio, y los mensajes, fotos de recibos y montos que los
              socios envían por WhatsApp para anotar gastos de obra.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Para qué los usamos</h2>
            <p>
              Solo para llevar las cuentas de las casas: registrar gastos, aportes y ventas, y responder por WhatsApp
              a quien escribió. Para leer los mensajes usamos un servicio de inteligencia artificial de Google.
              No vendemos ni compartimos los datos con nadie más.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Dónde se guardan</h2>
            <p>En servidores de Supabase y Vercel, con acceso restringido a los socios.</p>
          </section>
          <section>
            <h2 className="font-semibold">Tus derechos</h2>
            <p>
              Puedes pedir ver, corregir o borrar tus datos escribiendo a mauriciomolina0927@gmail.com.
            </p>
          </section>
        </div>
      </Card>
    </main>
  );
}
