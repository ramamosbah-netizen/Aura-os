import type { Id } from '@aura/shared';
import type { CbsNode } from './domain/cbs';

export const CBS_STORE = Symbol('CBS_STORE');

export interface CbsNodeFilter {
  projectId?: Id;
  parentId?: Id | null;
  category?: string;
}

export interface CbsStore {
  create(node: CbsNode): Promise<void>;
  update(node: CbsNode): Promise<void>;
  get(id: Id): Promise<CbsNode | null>;
  list(filter?: CbsNodeFilter): Promise<CbsNode[]>;
  delete(id: Id): Promise<void>;
}
