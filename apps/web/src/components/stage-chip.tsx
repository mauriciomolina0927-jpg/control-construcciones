import { STAGE_LABELS, type Stage } from "@/lib/stages";
import { Chip, type ChipTone } from "./ui";

const TONES: Record<Stage, ChipTone> = {
  lot: "neutral",
  design: "neutral",
  construction: "amber",
  for_sale: "green",
  sold: "accent",
  settled: "neutral",
};

export function StageChip({ stage }: { stage: Stage }) {
  return <Chip tone={TONES[stage]}>{STAGE_LABELS[stage]}</Chip>;
}
