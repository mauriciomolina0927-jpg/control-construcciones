import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/membership";
import { HouseForm } from "./house-form";

export default async function NewHousePage() {
  const { supabase, membership } = await requireMembership();
  if (membership?.role !== "admin") redirect("/casas");

  const { data: partners } = await supabase.from("partners").select("id, name").order("created_at");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-[28px] font-normal tracking-[-0.03em]">Nueva casa</h1>
      <Card>
        <HouseForm partners={partners ?? []} />
      </Card>
    </div>
  );
}
