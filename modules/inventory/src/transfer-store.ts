import type { Id, Page, PageParams } from '@aura/shared';
import type { StockTransfer } from './domain/stock-transfer';

export const TRANSFER_STORE = Symbol('TRANSFER_STORE');

export interface TransferFilter {
  tenantId?: string;
  limit?: number;
}

export interface TransferStore {
  save(transfer: StockTransfer): Promise<void>;
  get(id: Id): Promise<StockTransfer | null>;
  list(filter?: TransferFilter): Promise<StockTransfer[]>;
  listPaged(filter: TransferFilter, page: PageParams): Promise<Page<StockTransfer>>;
}
