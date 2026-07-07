import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { Submittal } from './domain/submittal';
import type { SubmittalStore, DocListFilter } from './store.interface';
import { pageDocs } from './paged-query';

export class InMemorySubmittalStore implements SubmittalStore {
  private items = new Map<string, Submittal>();

  async save(submittal: Submittal, tx?: TxHandle): Promise<void> {
    this.items.set(submittal.id, { ...submittal });
  }

  async findById(id: string, tenantId: string): Promise<Submittal | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<Submittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.projectId === projectId && item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findAll(tenantId: string): Promise<Submittal[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Submittal>> {
    return pageDocs(this.items.values(), filter, page, (a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
