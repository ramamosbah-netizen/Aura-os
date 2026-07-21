import type { Id, NegotiationEntry } from '@aura/shared';
import type { NegotiationFilter, NegotiationStore } from './negotiation-store';

/** Phase-0 negotiation log. Mirrors the Postgres ordering so the two read identically. */
export class InMemoryNegotiationStore implements NegotiationStore {
  private readonly rows = new Map<string, NegotiationEntry>();

  async append(entry: NegotiationEntry): Promise<void> {
    this.rows.set(entry.id, { ...entry });
  }

  async list(filter: NegotiationFilter): Promise<NegotiationEntry[]> {
    return [...this.rows.values()]
      .filter((e) => e.tenantId === filter.tenantId)
      .filter((e) => !filter.quotationId || e.quotationId === filter.quotationId)
      // Oldest first: the log is read as a conversation, and a conversation runs forwards.
      // createdAt breaks ties so two entries back-dated to the same moment keep a stable order.
      .sort((a, b) => (a.occurredAt === b.occurredAt
        ? (a.createdAt < b.createdAt ? -1 : 1)
        : (a.occurredAt < b.occurredAt ? -1 : 1)))
      .map((e) => ({ ...e }));
  }

  async remove(id: Id): Promise<boolean> {
    return this.rows.delete(id);
  }
}
