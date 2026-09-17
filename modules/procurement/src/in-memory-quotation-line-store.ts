import type { Id } from '@aura/shared';
import type { QuotationLine } from './domain/quotation-line';
import type { QuotationLineStore } from './quotation-line.store';

export class InMemoryQuotationLineStore implements QuotationLineStore {
  private readonly rows = new Map<string, QuotationLine>();

  async create(line: QuotationLine): Promise<void> {
    // Mirrors the table's unique index: two prices for one requirement inside one revision is an
    // ambiguity nobody can resolve. The same item priced on a base offer AND on an alternative is
    // two legitimate answers, which is why this is scoped to the revision rather than the supplier.
    const clash = [...this.rows.values()].find(
      (r) => r.tenantId === line.tenantId && r.revisionId === line.revisionId && r.prLineId === line.prLineId);
    if (clash) throw new Error('this quotation revision already answers that requisition line');
    this.rows.set(line.id, { ...line });
  }

  async listByRevision(tenantId: Id, revisionId: Id): Promise<QuotationLine[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId && r.revisionId === revisionId)
      .map((r) => ({ ...r }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

  async listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]> {
    return [...this.rows.values()]
      .filter((l) => l.tenantId === tenantId && l.prLineId === prLineId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
