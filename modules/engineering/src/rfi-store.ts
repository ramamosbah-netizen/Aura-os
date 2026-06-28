import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Rfi } from './domain/rfi';

export interface RfiFilter {
  tenantId?: Id;
  projectId?: Id;
  status?: Rfi['status'];
  limit?: number;
}

export interface RfiStore {
  create(rfi: Rfi): Promise<void>;
  createWithClient(tx: TxHandle | null, rfi: Rfi): Promise<void>;
  update(rfi: Rfi): Promise<void>;
  updateWithClient(tx: TxHandle | null, rfi: Rfi): Promise<void>;
  get(id: Id): Promise<Rfi | null>;
  getByCode(tenantId: Id, projectId: Id, code: string): Promise<Rfi | null>;
  list(filter?: RfiFilter): Promise<Rfi[]>;
}

export const RFI_STORE = Symbol('RfiStore');
