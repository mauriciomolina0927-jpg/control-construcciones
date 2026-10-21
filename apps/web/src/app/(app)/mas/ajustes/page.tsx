import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatPhone } from "@/lib/whatsapp/phone";
import { cancelInvitation } from "./actions";
import { AddPartnerForm, InviteForm, WhatsappPhoneForm } from "./forms";

export default async function SettingsPage() {
  const { supabase, membership } = await requireMembership();
  if (membership?.role !== "admin") redirect("/mas");

  const [{ data: partners }, { data: invitations }] = await Promise.all([
    supabase.from("partners").select("id, name, user_id, whatsapp_phone").order("created_at"),
    supabase.from("invitations").select("id, email, role, accepted_at, partner_id").order("created_at"),
  ]);
  const partnerName = new Map((partners ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-[28px] font-normal tracking-[-0.03em]">Socios e invitaciones</h1>

      <Card className="space-y-4">
        <h2 className="font-semibold">Socios</h2>
        <ul className="divide-y divide-line text-sm">
          {(partners ?? []).map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <div className="flex justify-between">
                <span>{p.name}</span>
                <span className="text-foreground/60">{p.user_id ? "Con acceso" : "Sin acceso"}</span>
              </div>
              <WhatsappPhoneForm partnerId={p.id} phone={p.whatsapp_phone ? formatPhone(p.whatsapp_phone) : null} />
            </li>
          ))}
          {!partners?.length && <li className="py-2 text-foreground/60">Todavía no hay socios.</li>}
        </ul>
        <p className="text-xs text-foreground/60">
          El celular es el que cada socio usa para mandar gastos al WhatsApp de la empresa. Solo esos números son atendidos.
        </p>
        <AddPartnerForm />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Invitaciones</h2>
        <p className="text-sm text-foreground/70">
          Solo los correos invitados pueden entrar. La primera vez reciben un código en el correo y luego crean su PIN.
        </p>
        <ul className="divide-y divide-line text-sm">
          {(invitations ?? []).map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {inv.email}
                <span className="block text-foreground/60">
                  {ROLE_LABELS[inv.role as Role]}
                  {inv.partner_id ? ` · ${partnerName.get(inv.partner_id)}` : ""}
                </span>
              </span>
              {inv.accepted_at ? (
                <span className="text-foreground/60">Aceptada</span>
              ) : (
                <form action={cancelInvitation}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button className="text-red-700 underline dark:text-red-400">Cancelar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <InviteForm partners={(partners ?? []).filter((p) => !p.user_id)} />
      </Card>
    </div>
  );
}
