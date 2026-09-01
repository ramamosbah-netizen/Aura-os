import type { Id } from '@aura/shared';
import type { DeliveryItemMap } from './domain/delivery-item-map';
import type { DeliveryItemMapFilter, DeliveryItemMapStore } from './delivery-item-map-store';

function copy(map: DeliveryItemMap): DeliveryItemMap {
  return { ...map };
}

export class InMemoryDeliveryItemMapStore implements DeliveryItemMapStore {
  private readonly rows = new Map<string, DeliveryItemMap>();

  async create(map: DeliveryItemMap): Promise<DeliveryItemMap> {
    const identity = `${map.tenantId}:${map.projectId}:${map.frozenItemKey}`;
    const existing = this.rows.get(identity);
    if (existing) return copy(existing);
    this.rows.set(identity, copy(map));
    return copy(map);
  }

  async get(id: Id): Promise<DeliveryItemMap | null> {
    for (const row of this.rows.values()) if (row.id === id) return copy(row);
    return null;
  }

  async getByIdentity(tenantId: Id, projectId: Id, frozenItemKey: string): Promise<DeliveryItemMap | null> {
    const row = this.rows.get(`${tenantId}:${projectId}:${frozenItemKey}`);
    return row ? copy(row) : null;
  }

  async list(filter: DeliveryItemMapFilter = {}): Promise<DeliveryItemMap[]> {
    return [...this.rows.values()]
      .filter((row) => filter.tenantId === undefined || row.tenantId === filter.tenantId)
      .filter((row) => filter.projectId === undefined || row.projectId === filter.projectId)
      .filter((row) => filter.handoverId === undefined || row.handoverId === filter.handoverId)
      .filter((row) => filter.frozenItemKey === undefined || row.frozenItemKey === filter.frozenItemKey)
      .map(copy);
  }
}
