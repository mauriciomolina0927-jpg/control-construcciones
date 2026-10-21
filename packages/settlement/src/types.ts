/** Whole Colombian pesos. Never floating point. */
export type Peso = bigint;

export type PartnerId = string;

export type HouseStage =
  | "lot"
  | "design"
  | "construction"
  | "for_sale"
  | "sold"
  | "settled";

export type RecordStatus = "active" | "voided";

/** lot and construction count as capital; sale_cost is reimbursed before capital. */
export type ExpenseKind = "lot" | "construction" | "sale_cost";

export interface Partner {
  id: PartnerId;
  name: string;
  /** Share of the profit in basis points; all partners must sum to 10000. */
  profitShareBps: number;
}

export interface Expense {
  id: string;
  amount: Peso;
  kind: ExpenseKind;
  paidBy: PartnerId;
  status: RecordStatus;
}

export interface SalePayment {
  id: string;
  /** Negative for a refund to the buyer. */
  amount: Peso;
  date: string;
  receivedBy: PartnerId;
  status: RecordStatus;
}

export interface PartnerTransfer {
  id: string;
  from: PartnerId;
  to: PartnerId;
  amount: Peso;
}

export interface SettlementInput {
  partners: Partner[];
  expenses: Expense[];
  payments: SalePayment[];
  transfers?: PartnerTransfer[];
}

export interface PartnerSettlement {
  partnerId: PartnerId;
  /** Capital contributed (lot + construction expenses paid). */
  contributed: Peso;
  /** Sale costs this partner paid. */
  saleCostsPaid: Peso;
  saleCostsReimbursed: Peso;
  capitalReturned: Peso;
  profit: Peso;
  /** What the rule assigns to this partner with the money received so far. */
  entitled: Peso;
  /** Money from the buyer that landed in this partner's account, net of transfers. */
  held: Peso;
  /** entitled - held. Positive: the others owe this partner. Negative: this partner owes. */
  balance: Peso;
}

export interface Settlement {
  /** Sum of active buyer payments, refunds included. */
  received: Peso;
  totalSaleCosts: Peso;
  /** received minus sale costs reimbursed, never below zero. */
  netReceived: Peso;
  totalCapital: Peso;
  /** max(netReceived - totalCapital, 0). */
  totalProfit: Peso;
  /** True once every partner has recovered all of their capital. */
  capitalRecovered: boolean;
  partners: PartnerSettlement[];
}
