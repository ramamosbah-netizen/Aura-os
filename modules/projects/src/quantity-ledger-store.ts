import type { QuantityTransaction } from './domain/quantity-transaction';

export const QUANTITY_LEDGER_STORE = Symbol('QUANTITY_LEDGER_STORE');

export interface QuantityLedgerFilter {
  tenantId: string;
  projectId?: string;
  boqItemId?: string;
  limit?: number;
}

/** The outcome of an append: whether this call wrote the row, or hit an existing one with the same
 * durable dedupe key (in which case `txn` is the transaction already on file). */
export interface QuantityAppendResult {
  txn: QuantityTransaction;
  inserted: boolean;
}

/** Append-only sub-ledger of project quantity transactions — the source of truth for BOQ progress. */
export interface QuantityLedgerStore {
  /** Append a transaction. If it carries a `dedupeKey` already present for the tenant, no row is
   * written and the existing transaction is returned with `inserted: false`. */
  append(txn: QuantityTransaction): Promise<QuantityAppendResult>;
  list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]>;
}
