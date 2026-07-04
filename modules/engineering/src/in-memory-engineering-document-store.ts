import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { EngineeringDocument } from './domain/engineering-document';
import type { EngineeringDocumentFilter, EngineeringDocumentStore } from './engineering-document-store';

export class InMemoryEngineeringDocumentStore implements EngineeringDocumentStore {
  private readonly items = new Map<string, EngineeringDocument>();

  async create(doc: EngineeringDocument): Promise<void> {
    this.items.set(doc.id, { ...doc });
  }

  async createWithClient(_tx: TxHandle | null, doc: EngineeringDocument): Promise<void> {
    await this.create(doc);
  }

  async update(doc: EngineeringDocument): Promise<void> {
    this.items.set(doc.id, { ...doc });
  }

  async updateWithClient(_tx: TxHandle | null, doc: EngineeringDocument): Promise<void> {
    await this.update(doc);
  }

  async get(id: Id): Promise<EngineeringDocument | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async list(filter: EngineeringDocumentFilter = {}): Promise<EngineeringDocument[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.docType) list = list.filter((i) => i.docType === filter.docType);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }

  async listPaged(filter: EngineeringDocumentFilter, page: PageParams): Promise<Page<EngineeringDocument>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
