import type { Id, Page, PageParams } from '@aura/shared';
import type { BimModel } from './domain/bim-model';

export interface BimModelFilter {
  tenantId?: Id;
  projectId?: Id;
  discipline?: string;
  status?: string;
  limit?: number;
}

export interface BimModelStore {
  save(model: BimModel): Promise<void>;
  get(id: Id): Promise<BimModel | null>;
  list(filter?: BimModelFilter): Promise<BimModel[]>;
  listPaged(filter: BimModelFilter, page: PageParams): Promise<Page<BimModel>>;
}

export const BIM_MODEL_STORE = Symbol('BimModelStore');
