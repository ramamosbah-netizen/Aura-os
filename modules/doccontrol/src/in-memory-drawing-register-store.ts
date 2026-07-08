import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { DrawingRegisterEntry } from './domain/drawing-register';
import type { DrawingRegisterStore, DocListFilter } from './store.interface';
import { pageDocs } from './paged-query';

export class InMemoryDrawingRegisterStore implements DrawingRegisterStore {
  private items = new Map<string, DrawingRegisterEntry>();

  async save(entry: DrawingRegisterEntry, _tx?: TxHandle): Promise<void> {
    this.items.set(entry.id, { ...entry });
  }

  async findById(id: string, tenantId: string): Promise<DrawingRegisterEntry | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return { ...item };
  }

  async findByProject(projectId: string, tenantId: string): Promise<DrawingRegisterEntry[]> {
    return Array.from(this.items.values())
      .filter((item) => item.projectId === projectId && item.tenantId === tenantId)
      .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  }

  async findAll(tenantId: string): Promise<DrawingRegisterEntry[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  }

  async listPaged(filter: DocListFilter, page: PageParams): Promise<Page<DrawingRegisterEntry>> {
    return pageDocs(this.items.values(), filter, page, (a, b) => a.documentNumber.localeCompare(b.documentNumber));
  }
}
