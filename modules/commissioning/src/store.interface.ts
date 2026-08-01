import type { Page, PageParams } from '@aura/shared';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { HandoverPackage } from './domain/handover';

export const COMMISSIONING_STORE = Symbol('COMMISSIONING_STORE');

export interface CommissioningStore {
  // Commissioning (system-level T&C)
  save(record: CommissioningRecord): Promise<void>;
  find(id: string, tenantId: string): Promise<CommissioningRecord | null>;
  list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]>;
  listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>>;

  // Handover (project-level acceptance)
  saveHandover(pkg: HandoverPackage): Promise<void>;
  findHandover(id: string, tenantId: string): Promise<HandoverPackage | null>;
  listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]>;
}
