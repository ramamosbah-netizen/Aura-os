import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { COMMISSIONING_STORE, type CommissioningStore } from './store.interface';
import {
  type CommissioningRecord,
  type ElvSystem,
  makeCommissioningRecord,
  recordTest,
  commission,
  fail,
} from './domain/commissioning-record';
import { type CommissioningTestItem, makeTestItem, recordResult } from './domain/commissioning-test-item';
import { type PunchItem, type PunchSeverity, makePunchItem, closePunch } from './domain/punch-item';

/**
 * Commissioning (Test & Commission) application service. The register that proves ELV
 * systems perform to spec and captures the witnessed sign-off that unlocks handover.
 * Pure domain transitions live in domain/commissioning-record; this layer loads, applies,
 * and persists. Store is swapped Postgres/in-memory at the module DI seam.
 */
@Injectable()
export class CommissioningService {
  private readonly logger = new Logger('CommissioningService');

  constructor(
    @Inject(COMMISSIONING_STORE) private readonly store: CommissioningStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async register(params: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    code: string;
    title: string;
    system?: ElvSystem;
    location?: string | null;
    pointsTotal?: number;
    createdBy?: string | null;
  }): Promise<CommissioningRecord> {
    const rec = makeCommissioningRecord(params);
    await this.store.save(rec);
    this.logger.log(`[Commissioning] registered ${rec.code} (${rec.system}) on project ${rec.projectId}`);
    return rec;
  }

  async get(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    return this.store.find(id, tenantId);
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return this.store.list(tenantId, projectId);
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    return this.store.listPaged(tenantId, page, projectId);
  }

  async recordTest(
    id: string,
    tenantId: string,
    patch: { pointsPassed: number; pointsTotal?: number; testDate?: string | null; remarks?: string | null },
  ): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const next = recordTest(rec, patch);
    await this.store.save(next);
    return next;
  }

  async commission(
    id: string,
    tenantId: string,
    patch: { commissionedBy: string; witnessedBy: string },
  ): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    // Retest gate: a system with open defects on its punch list cannot be signed off.
    const openPunch = (await this.store.listPunchItems(id, tenantId)).filter((p) => p.status === 'open');
    if (openPunch.length > 0) {
      throw new Error(`only a system with no open punch items can be commissioned (${openPunch.length} open)`);
    }
    const next = commission(rec, patch);
    await this.store.save(next);
    // A commissioned system is a step toward project handover; a reactor watches for the last one
    // on a project and opens the handover package (commission → handover).
    await this.events.append([
      makeEvent({
        type: 'commissioning.record.commissioned',
        tenantId: next.tenantId,
        companyId: next.companyId,
        actorId: next.createdBy,
        aggregateType: 'commissioning.record',
        aggregateId: next.id,
        payload: { projectId: next.projectId, projectName: next.projectName, system: next.system },
      }),
    ]);
    this.logger.log(`[Commissioning] ${rec.code} commissioned by ${patch.commissionedBy}, witnessed by ${patch.witnessedBy}`);
    return next;
  }

  async fail(id: string, tenantId: string, reason: string): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const next = fail(rec, reason);
    await this.store.save(next);
    return next;
  }

  // ── Test sheet (itemized results behind the tally) ───────────────────────────

  /** Add a test point to the sheet. Raises the record's pointsTotal (still a draft of the test). */
  async addTestItem(
    id: string,
    tenantId: string,
    input: { pointNo: string; description: string; expected?: string | null },
  ): Promise<CommissioningTestItem> {
    const rec = await this.mustFind(id, tenantId);
    if (rec.status === 'commissioned') throw new Error('conflict: record is already commissioned');
    const item = makeTestItem({ tenantId, companyId: rec.companyId, commissioningId: rec.id, projectId: rec.projectId, ...input });
    await this.store.saveTestItem(item);
    await this.syncTally(rec, tenantId);
    return item;
  }

  /** Record a test point's actual result and re-sync the record's pass/total tally + status. */
  async recordTestResult(
    id: string,
    itemId: string,
    tenantId: string,
    input: { result: 'pass' | 'fail'; actual?: string | null; remarks?: string | null; testedBy?: string | null },
  ): Promise<CommissioningTestItem> {
    const rec = await this.mustFind(id, tenantId);
    if (rec.status === 'commissioned') throw new Error('conflict: record is already commissioned');
    const item = await this.store.findTestItem(itemId, tenantId);
    if (!item || item.commissioningId !== id) throw new Error(`not found: test item ${itemId}`);
    const updated = recordResult(item, input);
    await this.store.saveTestItem(updated);
    await this.syncTally(rec, tenantId);
    return updated;
  }

  /** Roll the itemized results up into the record's pointsTotal/pointsPassed (+ derived status). */
  private async syncTally(rec: CommissioningRecord, tenantId: string): Promise<void> {
    const items = await this.store.listTestItems(rec.id, tenantId);
    if (items.length === 0) return;
    const total = items.length;
    const passed = items.filter((i) => i.result === 'pass').length;
    const anyFail = items.some((i) => i.result === 'fail');
    const status: CommissioningRecord['status'] = anyFail ? 'failed' : passed >= total ? 'tested' : 'in_progress';
    await this.store.save({ ...rec, pointsTotal: total, pointsPassed: passed, status, updatedAt: new Date().toISOString() });
  }

  listTestItems(id: string, tenantId: string): Promise<CommissioningTestItem[]> {
    return this.store.listTestItems(id, tenantId);
  }

  // ── Punch list (defects that gate sign-off) ──────────────────────────────────

  async addPunchItem(
    id: string,
    tenantId: string,
    input: { description: string; severity?: PunchSeverity; location?: string | null; raisedBy?: string | null },
  ): Promise<PunchItem> {
    const rec = await this.mustFind(id, tenantId);
    const item = makePunchItem({ tenantId, companyId: rec.companyId, commissioningId: rec.id, projectId: rec.projectId, ...input });
    await this.store.savePunchItem(item);
    return item;
  }

  async closePunchItem(
    id: string,
    punchId: string,
    tenantId: string,
    input: { resolution: string; closedBy?: string | null },
  ): Promise<PunchItem> {
    const item = await this.store.findPunchItem(punchId, tenantId);
    if (!item || item.commissioningId !== id) throw new Error(`not found: punch item ${punchId}`);
    const updated = closePunch(item, input);
    await this.store.savePunchItem(updated);
    return updated;
  }

  listPunchItems(id: string, tenantId: string): Promise<PunchItem[]> {
    return this.store.listPunchItems(id, tenantId);
  }

  /** The commissioning 360: the record with its test sheet + punch list. */
  async getDetail(id: string, tenantId: string): Promise<{ record: CommissioningRecord; testItems: CommissioningTestItem[]; punchItems: PunchItem[] } | null> {
    const record = await this.store.find(id, tenantId);
    if (!record) return null;
    const [testItems, punchItems] = await Promise.all([this.store.listTestItems(id, tenantId), this.store.listPunchItems(id, tenantId)]);
    return { record, testItems, punchItems };
  }

  private async mustFind(id: string, tenantId: string): Promise<CommissioningRecord> {
    const rec = await this.store.find(id, tenantId);
    if (!rec) throw new Error(`not found: commissioning record ${id}`);
    return rec;
  }
}
