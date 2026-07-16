import type { Id } from '@aura/shared';
import type { CommercialBaseline } from './domain/commercial-baseline';
import type { CommercialBaselineStore } from './commercial-baseline-store';

/** Phase-0 baseline store — immutable snapshots in memory (no-DB boots). */
export class InMemoryCommercialBaselineStore implements CommercialBaselineStore {
  private readonly rows = new Map<string, CommercialBaseline>();

  async save(b: CommercialBaseline): Promise<void> {
    this.rows.set(b.id, { ...b, lines: b.lines.map((l) => ({ ...l })) });
  }
  async get(id: Id): Promise<CommercialBaseline | null> {
    const b = this.rows.get(id);
    return b ? { ...b, lines: b.lines.map((l) => ({ ...l })) } : null;
  }
  async list(tenantId: Id, limit = 5000): Promise<CommercialBaseline[]> {
    return [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => (a.lockedAt < b.lockedAt ? 1 : -1))
      .slice(0, limit)
      .map((b) => ({ ...b, lines: b.lines.map((l) => ({ ...l })) }));
  }

  async getByQuotation(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null> {
    const matches = [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId && b.quotationId === quotationId)
      .sort((a, b) => (a.lockedAt < b.lockedAt ? 1 : -1));
    const b = matches[0];
    return b ? { ...b, lines: b.lines.map((l) => ({ ...l })) } : null;
  }
}
