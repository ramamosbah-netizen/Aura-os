import type { Id } from '@aura/shared';
import type { PricingSheet } from './domain/pricing-sheet';

/** DI token for the pricing-sheet store. */
export const CRM_PRICING_SHEET_STORE = Symbol('CRM_PRICING_SHEET_STORE');

export interface PricingSheetFilter {
  tenantId: Id;
  opportunityId?: Id;
  quotationId?: Id;
  limit?: number;
}

export interface PricingSheetStore {
  save(sheet: PricingSheet): Promise<void>;
  get(id: Id): Promise<PricingSheet | null>;
  /** Newest first — the version being worked on tops the list. */
  list(filter: PricingSheetFilter): Promise<PricingSheet[]>;
  remove(id: Id): Promise<boolean>;
}
