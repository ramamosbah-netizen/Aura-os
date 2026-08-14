import { type Id, newId, moneyNumber as round2 } from '@aura/shared';

// The Project Transaction Engine — the sub-ledger between the ERP modules and the CBS/WBS.
//
// No module (procurement, inventory, fleet, hr…) touches the CBS directly. Every money- or
// quantity-bearing event becomes an append-only CostTransaction that names WHERE it lands
// (cbsNodeId / wbsNodeId) and WHAT it is (committed / actual), and the Cost Engine posts it.
// The CBS balance is then SUM(ledger) — never a manually updated number — so a Credit Note, a
// Return-to-Store, a PO cancellation or an invoice reversal is simply a NEGATIVE entry. The
// full audit trail ("show transactions" on any cost line, like a bank statement) is the ledger.
//
// `dimensions` is a free-form bag (costCode, location, supplier, subcontractor, drawing, boqItem,
// activity, floor, zone…) so the system can later answer "cost of Access Control on level 2 for
// supplier X" by filtering the ledger — no schema change, no new development.

/** The ledger effect. Sign lives in `amount` (negative = credit/reversal/return/omission).
 * `budget` = the approved cost baseline (BAC): opening estimate + approved variation changes. */
export type CostTxnType = 'committed' | 'actual' | 'budget';

/** Where the transaction came from — provenance, for the drill-down + reversals. */
export type CostTxnSource =
  | 'po' | 'invoice' | 'material_issue' | 'material_return' | 'plant_usage'
  | 'subcontract' | 'labour_timesheet' | 'subcontract_claim' | 'variation' | 'expense'
  | 'credit_note' | 'reversal' | 'adjustment' | 'other';

export interface CostTransaction {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  /** The CBS cost line this posts to — the source of truth for cost. */
  cbsNodeId: Id | null;
  /** The WBS node, when the transaction also bears progress/earned-value. */
  wbsNodeId: Id | null;
  type: CostTxnType;
  /** AED. May be negative (credit note, reversal, return). */
  amount: number;
  /** Optional quantity movement carried alongside the cost (for the quantity ledger). */
  quantity: number | null;
  source: CostTxnSource;
  /** The originating document reference, e.g. "PO-1023" / "INV-88". */
  sourceRef: string | null;
  /** Free-form slicing keys (costCode, location, supplier, drawing, boqItem, activity…). */
  dimensions: Record<string, string> | null;
  occurredAt: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewCostTransaction {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  cbsNodeId?: Id | null;
  wbsNodeId?: Id | null;
  type: CostTxnType;
  amount: number;
  quantity?: number | null;
  source: CostTxnSource;
  sourceRef?: string | null;
  dimensions?: Record<string, string> | null;
  occurredAt?: string;
  createdBy?: Id | null;
}

export function makeCostTransaction(input: NewCostTransaction): CostTransaction {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    cbsNodeId: input.cbsNodeId ?? null,
    wbsNodeId: input.wbsNodeId ?? null,
    type: input.type,
    amount: Number(input.amount) || 0,
    quantity: input.quantity != null ? Number(input.quantity) : null,
    source: input.source,
    sourceRef: input.sourceRef?.trim() || null,
    dimensions: input.dimensions && Object.keys(input.dimensions).length > 0 ? input.dimensions : null,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    createdBy: input.createdBy ?? null,
  };
}

/** Roll a set of ledger entries into committed / actual totals — the CBS balance IS this sum. */
export function ledgerTotals(txns: CostTransaction[]): { committed: number; actual: number } {
  let committed = 0;
  let actual = 0;
  for (const t of txns) {
    if (t.type === 'committed') committed += t.amount;
    else actual += t.amount;
  }
  return { committed: round2(committed), actual: round2(actual) };
}
