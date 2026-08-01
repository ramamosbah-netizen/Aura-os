import type { Id } from '@aura/shared';
import type { MarketItem, MarketItemCategory } from './domain/market-item';

/** DI token for the market-intelligence catalogue store. */
export const MARKET_ITEM_STORE = Symbol('MARKET_ITEM_STORE');

export interface MarketItemFilter {
  tenantId: Id;
  /** Free-text search over name + brand — how an estimator finds an item. */
  q?: string;
  category?: MarketItemCategory;
  limit?: number;
}

export interface MarketItemStore {
  save(item: MarketItem): Promise<void>;
  list(filter: MarketItemFilter): Promise<MarketItem[]>;
  get(id: Id): Promise<MarketItem | null>;
  remove(id: Id): Promise<boolean>;
  /** How many items the tenant has — lets a seed run once and stay idempotent. */
  count(tenantId: Id): Promise<number>;
}
