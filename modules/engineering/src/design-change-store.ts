import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DesignChange } from './domain/design-change';

export interface DesignChangeFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: DesignChange['status'];
  limit?: number;
}

export interface DesignChangeStore {
  create(dc: DesignChange): Promise<void>;
  createWithClient(tx: TxHandle | null, dc: DesignChange): Promise<void>;
  update(dc: DesignChange): Promise<void>;
  updateWithClient(tx: TxHandle | null, dc: DesignChange): Promise<void>;
  get(id: Id): Promise<DesignChange | null>;
  list(filter?: DesignChangeFilter): Promise<DesignChange[]>;
  listPaged(filter: DesignChangeFilter, page: PageParams): Promise<Page<DesignChange>>;
}

export const DESIGN_CHANGE_STORE = Symbol('DesignChangeStore');
