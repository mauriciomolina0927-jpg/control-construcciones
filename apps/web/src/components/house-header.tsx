import Link from "next/link";
import type { ReactNode } from "react";
import type { Stage } from "@/lib/stages";
import { StageChip } from "./stage-chip";
import { BackLink } from "./ui";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "lot", label: "Lote" },
  { stage: "design", label: "Diseño" },
  { stage: "construction", label: "Obra" },
  { stage: "for_sale", label: "En venta" },
  { stage: "sold", label: "Vendida" },
  { stage: "settled", label: "Repartida" },
];

export type HouseTab = "resumen" | "gastos" | "venta" | "reparto" | "actividad";

/** Title, stage line and tabs shared by every screen of one house. */
export function HouseHeader({
  house,
  active,
  actions,
}: {
  house: { id: string; name: string; stage: Stage; address?: string | null };
  active: HouseTab;
  actions?: ReactNode;
}) {
  const current = STEPS.findIndex((s) => s.stage === house.stage);
  const tabs: { key: HouseTab; label: string; href: string }[] = [
    { key: "resumen", label: "Resumen", href: `/casas/${house.id}` },
    { key: "gastos", label: "Gastos", href: `/dinero?casa=${house.id}` },
    { key: "venta", label: "Venta", href: `/ventas/${house.id}` },
    { key: "reparto", label: "Reparto", href: `/casas/${house.id}/liquidacion` },
    { key: "actividad", label: "Actividad", href: `/casas/${house.id}/actividad` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackLink href="/casas">Casas</BackLink>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-normal tracking-[-0.03em] md:text-[36px]">{house.name}</h1>
            <StageChip stage={house.stage} />
          </div>
          {house.address && <p className="mt-1 text-sm text-foreground/60">{house.address}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <ol aria-label="Etapas" className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.stage} className="flex flex-1 flex-col gap-2" aria-current={i === current ? "step" : undefined}>
            <span className={`h-1 rounded-full ${i < current ? "bg-foreground" : i === current ? "bg-accent" : "bg-[#e3e3e3]"}`} />
            <span className={`hidden text-[13px] md:block ${i === current ? "font-medium" : i < current ? "" : "text-foreground/40"}`}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <nav aria-label="Secciones de la casa" className="-mx-4 flex overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`mr-6 shrink-0 border-b-2 py-3 text-sm ${
              t.key === active ? "border-foreground font-medium" : "border-transparent text-foreground/60"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
