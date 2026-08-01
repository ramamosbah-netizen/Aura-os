import type { Id } from '@aura/shared';
import type { PricingSheet } from './domain/pricing-sheet';
import type { PricingSheetFilter, PricingSheetStore } from './pricing-sheet-store';

/** Phase-0 pricing-sheet store. Mirrors the Postgres ordering (newest first). */
export class InMemoryPricingSheetStore implements PricingSheetStore {
  private readonly rows = new Map<string, PricingSheet>();

  async save(sheet: PricingSheet): Promise<void> {
    this.rows.set(sheet.id, structuredClone(sheet));
  }

  async get(id: Id): Promise<PricingSheet | null> {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }

  async list(filter: PricingSheetFilter): Promise<PricingSheet[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenantId === filter.tenantId)
      .filter((r) => !filter.opportunityId || r.opportunityId === filter.opportunityId)
      .filter((r) => !filter.quotationId || r.quotationId === filter.quotationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, filter.limit ?? 50)
      .map((r) => structuredClone(r));
  }

  async remove(id: Id): Promise<boolean> {
    return this.rows.delete(id);
  }
}
