import type { CostTransaction } from './domain/cost-transaction';

export const COST_LEDGER_STORE = Symbol('COST_LEDGER_STORE');

export interface CostLedgerFilter {
  tenantId: string;
  projectId?: string;
  cbsNodeId?: string;
  limit?: number;
}

/** The outcome of an append: whether this call actually wrote the row, or hit an existing one with
 * the same durable dedupe key (in which case `txn` is the transaction already on file). The service
 * uses `inserted` to know whether to move the CBS balance — a dedupe hit must NOT move it again. */
export interface AppendResult {
  txn: CostTransaction;
  inserted: boolean;
}

/** Append-only sub-ledger of project cost transactions — the source of truth for CBS cost. */
export interface CostLedgerStore {
  /** Append a transaction. If it carries a `dedupeKey` already present for the tenant, no row is
   * written and the existing transaction is returned with `inserted: false`. */
  append(txn: CostTransaction): Promise<AppendResult>;
  list(filter: CostLedgerFilter): Promise<CostTransaction[]>;
}
