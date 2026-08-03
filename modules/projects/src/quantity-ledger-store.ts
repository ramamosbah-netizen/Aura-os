import type { QuantityTransaction } from './domain/quantity-transaction';

export const QUANTITY_LEDGER_STORE = Symbol('QUANTITY_LEDGER_STORE');

export interface QuantityLedgerFilter {
  tenantId: string;
  projectId?: string;
  boqItemId?: string;
  limit?: number;
}

/** Append-only sub-ledger of project quantity transactions — the source of truth for BOQ progress. */
export interface QuantityLedgerStore {
  append(txn: QuantityTransaction): Promise<void>;
  list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]>;
}
