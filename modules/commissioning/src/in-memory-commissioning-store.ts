import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { CommissioningStore } from './store.interface';
import type { CommissioningRecord } from './domain/commissioning-record';
import type { CommissioningTestItem } from './domain/commissioning-test-item';
import type { CommissioningTestRun } from './domain/commissioning-test-run';
import type { PunchItem } from './domain/punch-item';
import type { HandoverPackage } from './domain/handover';

/** Dev/test adapter — in-memory, non-persistent. Mirrors the Postgres adapter's ordering. */
export class InMemoryCommissioningStore implements CommissioningStore {
  private readonly records = new Map<string, CommissioningRecord>();
  private readonly testItems = new Map<string, CommissioningTestItem>();
  // Append-only, like the table: this adapter offers no way to replace or remove a run either, so a
  // test that passes here cannot be one that would fail against Postgres's refusal to update.
  private readonly testRuns: CommissioningTestRun[] = [];
  private readonly punchItems = new Map<string, PunchItem>();
  private readonly handovers = new Map<string, HandoverPackage>();

  async appendTestRun(run: CommissioningTestRun): Promise<void> {
    if (this.testRuns.some((r) => r.testItemId === run.testItemId && r.runNo === run.runNo)) {
      throw new Error(`conflict: run ${run.runNo} already recorded for test point ${run.testItemId}`);
    }
    this.testRuns.push({ ...run });
  }
  async listTestRunsForItem(testItemId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.testRuns.filter((r) => r.testItemId === testItemId && r.tenantId === tenantId).sort((a, b) => a.runNo - b.runNo);
  }
  async listTestRuns(commissioningId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.testRuns
      .filter((r) => r.commissioningId === commissioningId && r.tenantId === tenantId)
      .sort((a, b) => (a.testItemId === b.testItemId ? a.runNo - b.runNo : a.testItemId < b.testItemId ? -1 : 1));
  }

  async saveTestItem(item: CommissioningTestItem): Promise<void> {
    this.testItems.set(item.id, { ...item });
  }
  async findTestItem(id: string, tenantId: string): Promise<CommissioningTestItem | null> {
    const i = this.testItems.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }
  async listTestItems(commissioningId: string, tenantId: string): Promise<CommissioningTestItem[]> {
    return [...this.testItems.values()]
      .filter((i) => i.commissioningId === commissioningId && i.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async savePunchItem(item: PunchItem): Promise<void> {
    this.punchItems.set(item.id, { ...item });
  }
  async findPunchItem(id: string, tenantId: string): Promise<PunchItem | null> {
    const i = this.punchItems.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }
  async listPunchItems(commissioningId: string, tenantId: string): Promise<PunchItem[]> {
    return [...this.punchItems.values()]
      .filter((i) => i.commissioningId === commissioningId && i.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listTestItemsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestItem[]> {
    return [...this.testItems.values()]
      .filter((i) => i.tenantId === tenantId && (!projectId || i.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  async listTestRunsForProject(tenantId: string, projectId?: string): Promise<CommissioningTestRun[]> {
    return this.testRuns
      .filter((r) => r.tenantId === tenantId && (!projectId || r.projectId === projectId))
      .sort((a, b) => (a.testItemId === b.testItemId ? a.runNo - b.runNo : a.testItemId < b.testItemId ? -1 : 1));
  }
  async listPunchItemsForProject(tenantId: string, projectId?: string): Promise<PunchItem[]> {
    return [...this.punchItems.values()]
      .filter((i) => i.tenantId === tenantId && (!projectId || i.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async save(record: CommissioningRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async find(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    const r = this.records.get(id);
    return r && r.tenantId === tenantId ? { ...r } : null;
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.tenantId === tenantId && (!projectId || r.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    const all = await this.list(tenantId, projectId);
    const items = all.slice(page.offset, page.offset + page.limit);
    return makePage(items, all.length, page);
  }

  async saveHandover(pkg: HandoverPackage): Promise<void> {
    this.handovers.set(pkg.id, { ...pkg, checklist: { ...pkg.checklist } });
  }

  async findHandover(id: string, tenantId: string): Promise<HandoverPackage | null> {
    const h = this.handovers.get(id);
    return h && h.tenantId === tenantId ? { ...h, checklist: { ...h.checklist } } : null;
  }

  async listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]> {
    return [...this.handovers.values()]
      .filter((h) => h.tenantId === tenantId && (!projectId || h.projectId === projectId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((h) => ({ ...h, checklist: { ...h.checklist } }));
  }
}
