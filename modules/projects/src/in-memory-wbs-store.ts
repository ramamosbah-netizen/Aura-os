import type { Id } from '@aura/shared';
import type { WbsNode } from './domain/wbs';
import type { WbsNodeFilter, WbsStore } from './wbs-store';

export class InMemoryWbsStore implements WbsStore {
  private readonly nodes = new Map<string, WbsNode>();

  async create(node: WbsNode): Promise<void> {
    this.nodes.set(node.id, { ...node });
  }

  async update(node: WbsNode): Promise<void> {
    this.nodes.set(node.id, { ...node });
  }

  async get(id: Id): Promise<WbsNode | null> {
    const node = this.nodes.get(id);
    return node ? { ...node } : null;
  }

  async list(filter: WbsNodeFilter = {}): Promise<WbsNode[]> {
    let out = [...this.nodes.values()];
    if (filter.tenantId) out = out.filter((n) => n.tenantId === filter.tenantId);
    if (filter.projectId) out = out.filter((n) => n.projectId === filter.projectId);
    if (filter.parentId !== undefined) {
      out = out.filter((n) => n.parentId === filter.parentId);
    }
    out.sort((a, b) => a.code.localeCompare(b.code));
    return out;
  }
}
