import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Submittal } from './domain/submittal';

export interface SubmittalFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: Submittal['status'];
  limit?: number;
}

export interface SubmittalStore {
  create(submittal: Submittal): Promise<void>;
  createWithClient(tx: TxHandle | null, submittal: Submittal): Promise<void>;
  update(submittal: Submittal): Promise<void>;
  updateWithClient(tx: TxHandle | null, submittal: Submittal): Promise<void>;
  get(id: Id): Promise<Submittal | null>;
  getByCode(tenantId: Id, projectId: Id, code: string): Promise<Submittal | null>;
  list(filter?: SubmittalFilter): Promise<Submittal[]>;
}

export const SUBMITTAL_STORE = Symbol('SubmittalStore');
