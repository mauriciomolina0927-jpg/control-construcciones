import { allocate } from "./allocate";
import type {
  HouseStage,
  PartnerId,
  PartnerSettlement,
  Peso,
  Settlement,
  SettlementInput,
} from "./types";

const BPS_TOTAL = 10_000;

/**
 * Settles a house with the money received so far, as a waterfall:
 * 1. reimburse sale costs to whoever paid them,
 * 2. return capital pro rata to each partner's contribution,
 * 3. split what is left as profit by profit share (50/50 today).
 * With less money than capital, step 3 never happens and the shortfall
 * falls on each partner in proportion to their contribution.
 */
export function settle(input: SettlementInput): Settlement {
  const { partners, expenses, payments, transfers = [] } = input;
  validate(input);

  const ids = partners.map((p) => p.id);
  const index = new Map<PartnerId, number>(ids.map((id, i) => [id, i]));
  const zeros = (): Peso[] => ids.map(() => 0n);

  const contributed = zeros();
  const saleCostsPaid = zeros();
  for (const e of expenses) {
    if (e.status !== "active") continue;
    const i = index.get(e.paidBy)!;
    if (e.kind === "sale_cost") saleCostsPaid[i]! += e.amount;
    else contributed[i]! += e.amount;
  }

  const held = zeros();
  let received = 0n;
  for (const p of payments) {
    if (p.status !== "active") continue;
    received += p.amount;
    held[index.get(p.receivedBy)!]! += p.amount;
  }
  for (const t of transfers) {
    held[index.get(t.from)!]! -= t.amount;
    held[index.get(t.to)!]! += t.amount;
  }

  const totalCapital = sum(contributed);
  const totalSaleCosts = sum(saleCostsPaid);
  let available = received > 0n ? received : 0n;

  const reimburseTotal = min(available, totalSaleCosts);
  const saleCostsReimbursed = allocate(reimburseTotal, saleCostsPaid, contributed);
  available -= reimburseTotal;
  const netReceived = available;

  const capitalTotal = min(available, totalCapital);
  const capitalReturned = allocate(capitalTotal, contributed, contributed);
  available -= capitalTotal;

  const totalProfit = available;
  const shares = partners.map((p) => BigInt(p.profitShareBps));
  const profit = allocate(totalProfit, shares, contributed);

  const result: PartnerSettlement[] = ids.map((partnerId, i) => {
    const entitled = saleCostsReimbursed[i]! + capitalReturned[i]! + profit[i]!;
    return {
      partnerId,
      contributed: contributed[i]!,
      saleCostsPaid: saleCostsPaid[i]!,
      saleCostsReimbursed: saleCostsReimbursed[i]!,
      capitalReturned: capitalReturned[i]!,
      profit: profit[i]!,
      entitled,
      held: held[i]!,
      balance: entitled - held[i]!,
    };
  });

  return {
    received,
    totalSaleCosts,
    netReceived,
    totalCapital,
    totalProfit,
    capitalRecovered: capitalTotal === totalCapital,
    partners: result,
  };
}

/** A settled house accepts no new expenses or payments. */
export function canRegisterMovement(stage: HouseStage): boolean {
  return stage !== "settled";
}

function validate({ partners, expenses, payments, transfers = [] }: SettlementInput): void {
  if (partners.length === 0) throw new Error("a house needs at least one partner");
  const ids = new Set(partners.map((p) => p.id));
  if (ids.size !== partners.length) throw new Error("duplicate partner id");

  const bps = partners.reduce((a, p) => a + p.profitShareBps, 0);
  if (bps !== BPS_TOTAL || partners.some((p) => !Number.isInteger(p.profitShareBps) || p.profitShareBps < 0)) {
    throw new Error("profit shares must be whole basis points summing to 10000");
  }

  for (const e of expenses) {
    if (!ids.has(e.paidBy)) throw new Error(`expense ${e.id}: unknown partner ${e.paidBy}`);
    if (e.amount <= 0n) throw new Error(`expense ${e.id}: amount must be positive`);
  }
  for (const p of payments) {
    if (!ids.has(p.receivedBy)) throw new Error(`payment ${p.id}: unknown partner ${p.receivedBy}`);
  }
  for (const t of transfers) {
    if (!ids.has(t.from) || !ids.has(t.to)) throw new Error(`transfer ${t.id}: unknown partner`);
    if (t.amount <= 0n) throw new Error(`transfer ${t.id}: amount must be positive`);
  }
}

function sum(values: readonly Peso[]): Peso {
  return values.reduce((a, b) => a + b, 0n);
}

function min(a: Peso, b: Peso): Peso {
  return a < b ? a : b;
}
