import type { Id } from '@aura/shared';
import type { CommercialBaseline } from './domain/commercial-baseline';

export const CRM_COMMERCIAL_BASELINE_STORE = Symbol('CRM_COMMERCIAL_BASELINE_STORE');

/** Append-only store for approved-price baselines — written once on quotation approval, read by
 * the quotation view and by the contract it is linked to. No update path: baselines are immutable. */
export interface CommercialBaselineStore {
  save(baseline: CommercialBaseline): Promise<void>;
  get(id: Id): Promise<CommercialBaseline | null>;
  /** The latest baseline locked for a quotation (there is normally one per approval). */
  getByQuotation(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null>;
  /** Every baseline for a tenant — the source-to-margin funnel (C5) needs the whole set to trace
   * contracts back to the deals they came from in one read, not one query per quotation. */
  list(tenantId: Id, limit?: number): Promise<CommercialBaseline[]>;
}
