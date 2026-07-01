import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Drawing } from './domain/drawing';

export interface DrawingFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: Drawing['status'];
  limit?: number;
}

export interface DrawingStore {
  create(drawing: Drawing): Promise<void>;
  createWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void>;
  update(drawing: Drawing): Promise<void>;
  updateWithClient(tx: TxHandle | null, drawing: Drawing): Promise<void>;
  get(id: Id): Promise<Drawing | null>;
  getByCode(tenantId: Id, projectId: Id, code: string, revision: string): Promise<Drawing | null>;
  list(filter?: DrawingFilter): Promise<Drawing[]>;
  listPaged(filter: DrawingFilter, page: PageParams): Promise<Page<Drawing>>;
}

export const DRAWING_STORE = Symbol('DrawingStore');
