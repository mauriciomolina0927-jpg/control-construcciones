import Link from "next/link";
import { Card } from "@/components/ui";
import { forgotPin } from "@/app/pin/actions";
import { requireMembership } from "@/lib/membership";

export default async function MorePage() {
  const { membership } = await requireMembership();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-[28px] font-normal tracking-[-0.03em]">Socios y cuenta</h1>
      <Card className="divide-y divide-line p-0">
        <Link href="/ventas" className="block px-5 py-4 md:hidden">
          Ventas y abonos
        </Link>
        {membership?.role === "admin" && (
          <Link href="/mas/ajustes" className="block px-5 py-4">
            Socios e invitaciones
          </Link>
        )}
        <form action={forgotPin}>
          <button className="block w-full px-5 py-4 text-left">Salir y cambiar de correo</button>
        </form>
      </Card>
    </div>
  );
}
