import type { TxHandle } from '@aura/core';
import type { Correspondence } from './domain/correspondence';
import type { CorrespondenceStore } from './store.interface';

export class InMemoryCorrespondenceStore implements CorrespondenceStore {
  private items = new Map<string, Correspondence>();

  async save(correspondence: Correspondence, tx?: TxHandle): Promise<void> {
    this.items.set(correspondence.id, { ...correspondence });
  }

  async findById(id: string, tenantId: string): Promise<Correspondence | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Correspondence[]> {
    return Array.from(this.items.values())
      .filter((item) => item.projectId === projectId && item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }

  async findAll(tenantId: string): Promise<Correspondence[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }
}
