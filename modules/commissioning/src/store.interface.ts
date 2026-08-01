import type { Page, PageParams } from '@aura/shared';
import type { CommissioningRecord } from './domain/commissioning-record';

export const COMMISSIONING_STORE = Symbol('COMMISSIONING_STORE');

export interface CommissioningStore {
  save(record: CommissioningRecord): Promise<void>;
  find(id: string, tenantId: string): Promise<CommissioningRecord | null>;
  list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]>;
  listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>>;
}
