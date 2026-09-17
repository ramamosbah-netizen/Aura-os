import type { Id } from '@aura/shared';
import type { QuotationLine } from './domain/quotation-line';
import type { QuotationLineStore } from './quotation-line.store';

export class InMemoryQuotationLineStore implements QuotationLineStore {
  private readonly rows = new Map<string, QuotationLine>();

  async create(line: QuotationLine): Promise<void> {
    const clash = await this.findForRequirement(line.tenantId, line.quotationId, line.prLineId);
    // Mirrors the table's unique constraint: two prices for one requirement from one supplier is an
    // ambiguity nobody can resolve, not a richer offer.
    if (clash) throw new Error('this quotation already answers that requisition line');
    this.rows.set(line.id, { ...line });
  }

  async update(line: QuotationLine): Promise<void> {
    this.rows.set(line.id, { ...line });
  }

  async get(id: Id): Promise<QuotationLine | null> {
    return this.rows.get(id) ?? null;
  }

  async remove(id: Id): Promise<void> {
    this.rows.delete(id);
  }

  async listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationLine[]> {
    return [...this.rows.values()]
      .filter((l) => l.tenantId === tenantId && l.quotationId === quotationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]> {
    return [...this.rows.values()]
      .filter((l) => l.tenantId === tenantId && l.prLineId === prLineId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async findForRequirement(tenantId: Id, quotationId: Id, prLineId: Id): Promise<QuotationLine | null> {
    return [...this.rows.values()].find(
      (l) => l.tenantId === tenantId && l.quotationId === quotationId && l.prLineId === prLineId,
    ) ?? null;
  }
}
