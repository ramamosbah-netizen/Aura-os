import type { Id } from '@aura/shared';
import type { QuotationLine } from './domain/quotation-line';
import type { QuotationLineStore } from './quotation-line.store';

export class InMemoryQuotationLineStore implements QuotationLineStore {
  private readonly rows = new Map<string, QuotationLine>();

  async create(line: QuotationLine): Promise<void> {
    /**
     * Mirrors the table's unique constraints: two prices for one requirement within one offer is an
     * ambiguity nobody can resolve, not a richer offer. Scoped to the REVISION for anything captured
     * now, and to the legacy quotation for rows that predate the family model — the same split the
     * two partial indexes make.
     */
    const clash = line.revisionId
      ? [...this.rows.values()].find(
          (r) => r.tenantId === line.tenantId && r.revisionId === line.revisionId && r.prLineId === line.prLineId)
      : line.quotationId
        ? await this.findForRequirement(line.tenantId, line.quotationId, line.prLineId)
        : null;
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
