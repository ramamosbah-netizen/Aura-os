import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { CommercialBaseline } from './domain/commercial-baseline';

export const CRM_COMMERCIAL_BASELINE_STORE = Symbol('CRM_COMMERCIAL_BASELINE_STORE');

/** Append-only store for approved-price baselines — written once on quotation approval, read by
 * the quotation view and by the contract it is linked to. No update path: baselines are immutable. */
export interface CommercialBaselineStore {
  save(baseline: CommercialBaseline): Promise<void>;
  /** Save on a caller-owned transaction so approval + baseline are atomic. */
  /** Returns true when this call inserted the baseline, false when the quotation already had one. */
  saveWithClient(tx: TxHandle | null, baseline: CommercialBaseline): Promise<boolean>;
  get(id: Id): Promise<CommercialBaseline | null>;
  /** The latest baseline locked for a quotation (there is normally one per approval). */
  getByQuotation(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null>;
  /** Every baseline for a tenant — the source-to-margin funnel (C5) needs the whole set to trace
   * contracts back to the deals they came from in one read, not one query per quotation. */
  list(tenantId: Id, limit?: number): Promise<CommercialBaseline[]>;
}
