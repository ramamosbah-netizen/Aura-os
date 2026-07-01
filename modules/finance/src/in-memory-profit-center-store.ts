import type { Id } from '@aura/shared';
import type { ProfitCenter } from './domain/profit-center';
import type { ProfitCenterStore } from './profit-center-store';

export class InMemoryProfitCenterStore implements ProfitCenterStore {
  private readonly rows = new Map<string, ProfitCenter>();

  async save(pc: ProfitCenter): Promise<void> {
    this.rows.set(pc.id, { ...pc });
  }

  async get(id: Id): Promise<ProfitCenter | null> {
    const c = this.rows.get(id);
    return c ? { ...c } : null;
  }

  async list(tenantId: string): Promise<ProfitCenter[]> {
    return [...this.rows.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => (a.code < b.code ? -1 : 1));
  }
}
