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

  /**
   * LISTING, and capped by default. It answers "show me some of the ledger".
   *
   * It may not answer a question about the whole of it — what the position is, whether a keyed
   * fact is already on file, what the certified total comes to. Those are the two reads below
   * (TC-GATE-20), and the difference is not academic: this is the ledger a quantity is billed
   * from.
   */
  list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]>;

  /**
   * The one transaction carrying this durable dedupe key, or null (TC-GATE-20).
   *
   * The key is unique per tenant — a partial unique index enforces it, and `append` conflicts on
   * it — so this returns at most one row and cannot be truncated. Every replay and reversal
   * lookup in the service used to search a capped list for exactly this.
   */
  findByDedupeKey(tenantId: string, dedupeKey: string): Promise<QuantityTransaction | null>;

  /**
   * The COMPLETE ledger of one BOQ item, newest first (TC-GATE-20).
   *
   * Uncapped, because a position is a sum and a sum of some of the rows is not a smaller answer
   * — it is a wrong one. Bounded by one item's real activity, and the
   * `(tenant_id, boq_item_id)` index is already there.
   *
   * NEWEST FIRST, deliberately and not for tidiness: `quantityPosition` takes the unit from the
   * first row that carries one, so the order is load-bearing for that single field. Preserved
   * exactly as the capped read returned it, so this gate changes completeness and nothing else.
   */
  listForBoqItem(tenantId: string, boqItemId: string): Promise<QuantityTransaction[]>;
}
