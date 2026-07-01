import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PurchaseOrder } from './domain/purchase-order';
import type { PurchaseOrderFilter, PurchaseOrderStore } from './purchase-order-store';

/** Phase-0 PO store — keeps purchase orders in memory (no-DB boots). */
export class InMemoryPurchaseOrderStore implements PurchaseOrderStore {
  private readonly pos = new Map<string, PurchaseOrder>();

  async create(po: PurchaseOrder): Promise<void> {
    this.pos.set(po.id, { ...po });
  }

  async createWithClient(_tx: TxHandle | null, po: PurchaseOrder): Promise<void> {
    return this.create(po);
  }

  async update(po: PurchaseOrder): Promise<void> {
    this.pos.set(po.id, { ...po });
  }

  async updateWithClient(_tx: TxHandle | null, po: PurchaseOrder): Promise<void> {
    return this.update(po);
  }

  async get(id: Id): Promise<PurchaseOrder | null> {
    const po = this.pos.get(id);
    return po ? { ...po } : null;
  }

  async list(filter: PurchaseOrderFilter = {}): Promise<PurchaseOrder[]> {
    let out = [...this.pos.values()];
    if (filter.tenantId) out = out.filter((p) => p.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((p) => p.status === filter.status);
    if (filter.projectId) out = out.filter((p) => p.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: PurchaseOrderFilter, page: PageParams): Promise<Page<PurchaseOrder>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
