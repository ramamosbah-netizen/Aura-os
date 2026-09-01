import type { Id } from '@aura/shared';
import type { DeliveryItemMap } from './domain/delivery-item-map';

export const DELIVERY_ITEM_MAP_STORE = Symbol('DELIVERY_ITEM_MAP_STORE');

export interface DeliveryItemMapFilter {
  tenantId?: Id;
  projectId?: Id;
  handoverId?: Id;
  frozenItemKey?: string;
}

export interface DeliveryItemMapStore {
  /** Inserts once; an identical identity returns the persisted row for replay safety. */
  create(map: DeliveryItemMap): Promise<DeliveryItemMap>;
  get(id: Id): Promise<DeliveryItemMap | null>;
  getByIdentity(tenantId: Id, projectId: Id, frozenItemKey: string): Promise<DeliveryItemMap | null>;
  list(filter?: DeliveryItemMapFilter): Promise<DeliveryItemMap[]>;
}
