import type { Id } from '@aura/shared';
import type { TaxCode, TaxLine } from './domain/tax';
import type { TaxCodeFilter, TaxCodeStore, TaxLineFilter, TaxLineStore } from './tax-store';

export class InMemoryTaxCodeStore implements TaxCodeStore {
  private readonly rows = new Map<string, TaxCode>();

  async create(code: TaxCode): Promise<void> { this.rows.set(code.id, { ...code }); }
  async update(code: TaxCode): Promise<void> { this.rows.set(code.id, { ...code }); }
  async get(id: Id): Promise<TaxCode | null> { return this.rows.get(id) ?? null; }

  async getByCode(tenantId: Id, code: string): Promise<TaxCode | null> {
    for (const tc of this.rows.values()) {
      if (tc.tenantId === tenantId && tc.code === code) return tc;
    }
    return null;
  }

  async list(filter?: TaxCodeFilter): Promise<TaxCode[]> {
    let arr = Array.from(this.rows.values());
    if (filter?.tenantId) arr = arr.filter((c) => c.tenantId === filter.tenantId);
    if (filter?.isActive !== undefined) arr = arr.filter((c) => c.isActive === filter.isActive);
    if (filter?.taxType) arr = arr.filter((c) => c.taxType === filter.taxType);
    return arr;
  }
}

export class InMemoryTaxLineStore implements TaxLineStore {
  private readonly rows = new Map<string, TaxLine>();

  async create(line: TaxLine): Promise<void> { this.rows.set(line.id, { ...line }); }

  async list(filter?: TaxLineFilter): Promise<TaxLine[]> {
    let arr = Array.from(this.rows.values());
    if (filter?.invoiceId) arr = arr.filter((l) => l.invoiceId === filter.invoiceId);
    if (filter?.taxCodeId) arr = arr.filter((l) => l.taxCodeId === filter.taxCodeId);
    if (filter?.tenantId) arr = arr.filter((l) => l.tenantId === filter.tenantId);
    return arr;
  }

  async deleteByInvoice(invoiceId: Id): Promise<void> {
    for (const [k, v] of this.rows) {
      if (v.invoiceId === invoiceId) this.rows.delete(k);
    }
  }
}
