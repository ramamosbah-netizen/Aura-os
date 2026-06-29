import type { Id } from '@aura/shared';
import type { CbsNode } from './domain/cbs';
import type { CbsNodeFilter, CbsStore } from './cbs-store';

export class InMemoryCbsStore implements CbsStore {
  private readonly rows = new Map<string, CbsNode>();

  async create(node: CbsNode): Promise<void> {
    this.rows.set(node.id, { ...node });
  }

  async update(node: CbsNode): Promise<void> {
    this.rows.set(node.id, { ...node });
  }

  async get(id: Id): Promise<CbsNode | null> {
    return this.rows.get(id) ?? null;
  }

  async list(filter?: CbsNodeFilter): Promise<CbsNode[]> {
    let arr = Array.from(this.rows.values());
    if (filter?.projectId) arr = arr.filter((n) => n.projectId === filter.projectId);
    if (filter?.parentId !== undefined) {
      arr = arr.filter((n) => n.parentId === filter.parentId);
    }
    if (filter?.category) arr = arr.filter((n) => n.category === filter.category);
    return arr;
  }

  async delete(id: Id): Promise<void> {
    this.rows.delete(id);
  }
}
