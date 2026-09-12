import type { Page, PageParams } from '@aura/shared';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { CommissioningTestRun } from './domain/commissioning-test-run';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage } from './domain/handover';

export const COMMISSIONING_STORE = Symbol('COMMISSIONING_STORE');

export interface CommissioningStore {
  // Commissioning (system-level T&C)
  save(record: CommissioningRecord): Promise<void>;
  find(id: string, tenantId: string): Promise<CommissioningRecord | null>;
  list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]>;
  listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>>;

  // Test-sheet items (the point definitions + the derived snapshot of their latest run)
  saveTestItem(item: CommissioningTestItem): Promise<void>;
  findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null>;
  listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]>;

  // Test runs — the authoritative, append-only evidence. There is no update and no delete, here or
  // in the database (migration 0296): a recorded run is a fact about what happened.
  appendTestRun(run: CommissioningTestRun): Promise<void>;
  listTestRunsForItem(testItemId: string, tenantId: string): Promise<CommissioningTestRun[]>;
  listTestRuns(commissioningId: string, tenantId: string): Promise<CommissioningTestRun[]>;

  // Punch list (defects that gate sign-off)
  savePunchItem(item: PunchItem): Promise<void>;
  findPunchItem(id: string, tenantId: string): Promise<PunchItem | null>;
  listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]>;

  // Workspace-wide reads. The T&C surfaces answer questions about a PROJECT ("what is stopping this
  // project being commissioned?"), not about one record, and doing that by looping the records would
  // be a query per system — slow, and wrong the moment a project has fifty.
  listTestItemsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestItem[]>;
  listTestRunsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestRun[]>;
  listPunchItemsForProject(tenantId: string, projectId?: string): Promise<PunchItem[]>;

  // Handover (project-level acceptance)
  saveHandover(pkg: HandoverPackage): Promise<void>;
  findHandover(id: string, tenantId: string): Promise<HandoverPackage | null>;
  listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]>;
}
