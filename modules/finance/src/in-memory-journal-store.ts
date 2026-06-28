import type { Id } from '@aura/shared';
import type { Journal } from './domain/journal';
import type { JournalFilter, JournalStore } from './journal-store';

export class InMemoryJournalStore implements JournalStore {
  private readonly journals = new Map<string, Journal>();

  async create(journal: Journal): Promise<void> {
    this.journals.set(journal.id, { ...journal });
  }

  async get(id: Id): Promise<Journal | null> {
    const j = this.journals.get(id);
    return j ? { ...j } : null;
  }

  async list(filter: JournalFilter = {}): Promise<Journal[]> {
    let out = [...this.journals.values()];
    if (filter.tenantId) out = out.filter((j) => j.tenantId === filter.tenantId);
    if (filter.reference) out = out.filter((j) => j.reference === filter.reference);
    out.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
