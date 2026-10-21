export type Stage = "lot" | "design" | "construction" | "for_sale" | "sold" | "settled";

export const STAGE_LABELS: Record<Stage, string> = {
  lot: "Lote",
  design: "Diseño",
  construction: "En obra",
  for_sale: "En venta",
  sold: "Vendida",
  settled: "Liquidada",
};

/** Stages a person can pick; "Liquidada" comes only from approving the final settlement. */
export const PICKABLE_STAGES: Stage[] = ["lot", "design", "construction", "for_sale", "sold"];

/** Splits the profit equally (50/50 for two partners); any leftover basis point goes to the first one. */
export function equalShares(partnerIds: string[]): { partner_id: string; profit_share_bps: number }[] {
  const base = Math.floor(10000 / partnerIds.length);
  return partnerIds.map((id, i) => ({
    partner_id: id,
    profit_share_bps: base + (i === 0 ? 10000 - base * partnerIds.length : 0),
  }));
}
