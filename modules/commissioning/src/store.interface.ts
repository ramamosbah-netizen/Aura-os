import type { Page, PageParams } from '@aura/shared';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage } from './domain/handover';

export const COMMISSIONING_STORE = Symbol('COMMISSIONING_STORE');

export interface CommissioningStore {
  // Commissioning (system-level T&C)
  save(record: CommissioningRecord): Promise<void>;
  find(id: string, tenantId: string): Promise<CommissioningRecord | null>;
  list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]>;
  listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>>;

  // Test-sheet items (the itemized test results behind the tally)
  saveTestItem(item: CommissioningTestItem): Promise<void>;
  findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null>;
  listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]>;

  // Punch list (defects that gate sign-off)
  savePunchItem(item: PunchItem): Promise<void>;
  findPunchItem(id: string, tenantId: string): Promise<PunchItem | null>;
  listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]>;

  // Handover (project-level acceptance)
  saveHandover(pkg: HandoverPackage): Promise<void>;
  findHandover(id: string, tenantId: string): Promise<HandoverPackage | null>;
  listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]>;
}
