import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { Transmittal } from './domain/transmittal';
import type { TransmittalStore, DocListFilter } from './store.interface';
import { pageDocs } from './paged-query';

export class InMemoryTransmittalStore implements TransmittalStore {
  private items = new Map<string, Transmittal>();

  async save(transmittal: Transmittal, tx?: TxHandle): Promise<void> {
    this.items.set(transmittal.id, { ...transmittal });
  }

  async findById(id: string, tenantId: string): Promise<Transmittal | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Transmittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.projectId === projectId && item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }

  async findAll(tenantId: string): Promise<Transmittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({ ...item }));
  }

  async listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Transmittal>> {
    return pageDocs(this.items.values(), filter, page, (a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
