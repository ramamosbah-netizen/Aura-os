import type { Id } from '@aura/shared';
import type { WbsNode } from './domain/wbs';

export const WBS_STORE = Symbol('WBS_STORE');

export interface WbsNodeFilter {
  tenantId?: string;
  projectId?: string;
  parentId?: string | null;
}

export interface WbsStore {
  create(node: WbsNode): Promise<void>;
  update(node: WbsNode): Promise<void>;
  get(id: Id): Promise<WbsNode | null>;
  list(filter?: WbsNodeFilter): Promise<WbsNode[]>;
}
