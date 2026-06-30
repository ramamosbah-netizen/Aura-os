import type { Id } from '@aura/shared';
import type { CostCenter } from './domain/cost-center';
import type { CostCenterStore } from './cost-center-store';

export class InMemoryCostCenterStore implements CostCenterStore {
  private readonly rows = new Map<string, CostCenter>();

  async save(cc: CostCenter): Promise<void> {
    this.rows.set(cc.id, { ...cc });
  }

  async get(id: Id): Promise<CostCenter | null> {
    const c = this.rows.get(id);
    return c ? { ...c } : null;
  }

  async list(tenantId: string): Promise<CostCenter[]> {
    return [...this.rows.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => (a.code < b.code ? -1 : 1));
  }
}
