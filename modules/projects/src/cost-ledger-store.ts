import type { CostTransaction } from './domain/cost-transaction';

export const COST_LEDGER_STORE = Symbol('COST_LEDGER_STORE');

export interface CostLedgerFilter {
  tenantId: string;
  projectId?: string;
  cbsNodeId?: string;
  limit?: number;
}

/** Append-only sub-ledger of project cost transactions — the source of truth for CBS cost. */
export interface CostLedgerStore {
  append(txn: CostTransaction): Promise<void>;
  list(filter: CostLedgerFilter): Promise<CostTransaction[]>;
}
