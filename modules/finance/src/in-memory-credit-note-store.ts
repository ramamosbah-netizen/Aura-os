import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CreditNote } from './domain/credit-note';
import type { CreditNoteFilter, CreditNoteStore } from './credit-note-store';

export class InMemoryCreditNoteStore implements CreditNoteStore {
  private readonly data = new Map<string, CreditNote>();

  async save(note: CreditNote): Promise<void> {
    this.data.set(note.id, { ...note, lines: note.lines.map((l) => ({ ...l })) });
  }

  async get(id: Id): Promise<CreditNote | null> {
    const n = this.data.get(id);
    return n ? { ...n, lines: n.lines.map((l) => ({ ...l })) } : null;
  }

  async list(filter: CreditNoteFilter = {}): Promise<CreditNote[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((n) => n.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((n) => n.status === filter.status);
    if (filter.customerInvoiceId) out = out.filter((n) => n.customerInvoiceId === filter.customerInvoiceId);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: CreditNoteFilter, page: PageParams): Promise<Page<CreditNote>> {
    const all = await this.list({ ...filter, limit: undefined });
    const items = all.slice(page.offset, page.offset + page.limit);
    return makePage(items, all.length, page);
  }

  async existsByNumber(tenantId: Id, creditNoteNumber: string): Promise<boolean> {
    return [...this.data.values()].some((n) => n.tenantId === tenantId && n.creditNoteNumber === creditNoteNumber);
  }
}
