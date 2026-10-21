import Link from "next/link";
import { Card } from "@/components/ui";
import { forgotPin } from "@/app/pin/actions";
import { requireMembership } from "@/lib/membership";

export default async function MorePage() {
  const { membership } = await requireMembership();

  return (
    <>
      <h1 className="text-xl font-bold">Más</h1>
      <Card className="divide-y divide-black/5 p-0 dark:divide-white/10">
        {membership?.role === "admin" && (
          <Link href="/mas/ajustes" className="block px-5 py-4">
            Socios e invitaciones
          </Link>
        )}
        <form action={forgotPin}>
          <button className="block w-full px-5 py-4 text-left">Salir y cambiar de correo</button>
        </form>
      </Card>
    </>
  );
}
