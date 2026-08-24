import type { Id } from '@aura/shared';
import type { PricingSheet } from './domain/pricing-sheet';

/** DI token for the pricing-sheet store. */
export const CRM_PRICING_SHEET_STORE = Symbol('CRM_PRICING_SHEET_STORE');

export interface PricingSheetFilter {
  tenantId: Id;
  opportunityId?: Id;
  packageId?: Id;
  status?: import('./domain/pricing-sheet').PricingSheetStatus;
  quotationId?: Id;
  /**
   * Effectivity (Slice 8): when true, return only sheets that are NOT superseded (`supersededAt IS
   * NULL`). Combined with `status: 'frozen'` this is the deterministic "current price" read — at most
   * one per effectivity scope. Historical reads omit this and get every revision.
   */
  currentOnly?: boolean;
  limit?: number;
}

export interface PricingSheetStore {
  save(sheet: PricingSheet): Promise<void>;
  get(id: Id): Promise<PricingSheet | null>;
  /** Newest first — the version being worked on tops the list. */
  list(filter: PricingSheetFilter): Promise<PricingSheet[]>;
  remove(id: Id): Promise<boolean>;
}
