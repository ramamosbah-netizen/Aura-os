import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { CommercialBaseline } from './domain/commercial-baseline';
import type { CommercialBaselineStore } from './commercial-baseline-store';

/** Phase-0 baseline store — immutable snapshots in memory (no-DB boots). */
export class InMemoryCommercialBaselineStore implements CommercialBaselineStore {
  private readonly rows = new Map<string, CommercialBaseline>();

  private static copy(b: CommercialBaseline): CommercialBaseline {
    return {
      ...b,
      lines: b.lines.map((l) => ({ ...l })),
      pricing: b.pricing ? { lines: b.pricing.lines.map((l) => ({ ...l })) } : null,
      estimation: b.estimation ? b.estimation.map((e) => ({ ...e })) : null,
    };
  }

  async save(b: CommercialBaseline): Promise<void> {
    const existing = [...this.rows.values()].find((row) => row.tenantId === b.tenantId && row.quotationId === b.quotationId);
    if (existing && existing.id !== b.id) return;
    this.rows.set(b.id, InMemoryCommercialBaselineStore.copy(b));
  }
  async saveWithClient(_tx: TxHandle | null, b: CommercialBaseline): Promise<boolean> {
    const existing = [...this.rows.values()].find((row) => row.tenantId === b.tenantId && row.quotationId === b.quotationId);
    if (existing && existing.id !== b.id) return false;
    await this.save(b);
    return true;
  }
  async get(id: Id): Promise<CommercialBaseline | null> {
    const b = this.rows.get(id);
    return b ? InMemoryCommercialBaselineStore.copy(b) : null;
  }
  async list(tenantId: Id, limit = 5000): Promise<CommercialBaseline[]> {
    return [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => (a.lockedAt < b.lockedAt ? 1 : -1))
      .slice(0, limit)
      .map(InMemoryCommercialBaselineStore.copy);
  }

  async getByQuotation(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null> {
    const matches = [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId && b.quotationId === quotationId)
      .sort((a, b) => (a.lockedAt < b.lockedAt ? 1 : -1));
    const b = matches[0];
    return b ? InMemoryCommercialBaselineStore.copy(b) : null;
  }
}
