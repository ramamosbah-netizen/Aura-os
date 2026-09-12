import { Inject, Injectable, Logger } from '@nestjs/common';
import { type HealthSignal, type Page, type PageParams, makeEvent } from '@aura/shared';
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
import { type CommissioningTestItem, makeTestItem, applyLatestRun } from './domain/commissioning-test-item';
import { type CommissioningTestRun, makeTestRun } from './domain/commissioning-test-run';
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

  /**
   * Commissioning's answer to "may this project close?".
   *
   * Implements `CommissioningReadinessPort` for Projects. Note what is NOT returned: a percentage.
   * "43% commissioned" is a number a reader has to interpret; "1 of 4 systems not commissioned" is
   * the sentence that tells them what to do next, and only this domain can produce it honestly.
   *
   * Zero systems is reported as zero, not smoothed to a pass. Projects turns that into UNKNOWN,
   * because a project that never tested anything has demonstrated nothing.
   */
  /**
   * Commissioning's own verdict on a project's health — §24.
   *
   * The counterpart to the readiness reading below, and the split is deliberate: that one hands
   * Projects counts for §27 to gate on, this one hands Projects a judgement, because §24 must not
   * decide what this domain means by serious.
   *
   * ONE DIFFERENCE FROM READINESS IS INTENTIONAL AND WORTH STATING. With no commissioning records
   * at all, readiness answers UNKNOWN and refuses the close — a project that never tested anything
   * has not demonstrated readiness. Health answers NOT_APPLICABLE for the same fact, because a
   * supply-only project has nothing to commission and reporting it as UNKNOWN would leave it at
   * partial coverage forever, until partial meant nothing at all.
   *
   * That is not an inconsistency: a gate must be satisfied, a lens must be honest about what there
   * was to look at.
   */
  async readProjectCommissioningHealth(tenantId: string, projectId: string): Promise<HealthSignal> {
    const href = `/project/${encodeURIComponent(projectId)}/workspace/testing`;
    const records = await this.list(tenantId, projectId);
    if (records.length === 0) {
      return { id: 'commissioning-readiness', domain: 'commissioning', state: 'NOT_APPLICABLE', reason: 'No systems are registered for commissioning on this project.' };
    }

    const punchLists = await Promise.all(records.map((r) => this.store.listPunchItems(r.id, tenantId)));
    const openPunch = punchLists.flat().filter((p) => p.status === 'open');
    const failed = records.filter((r) => r.status === 'failed').length;
    const criticalPunch = openPunch.filter((p) => p.severity === 'critical').length;
    const majorPunch = openPunch.filter((p) => p.severity === 'major').length;

    // A failed test and a critical punch item are this domain's two hard stops.
    if (failed > 0 || criticalPunch > 0) {
      const parts = [
        ...(failed > 0 ? [`${failed} system${failed === 1 ? '' : 's'} failed testing`] : []),
        ...(criticalPunch > 0 ? [`${criticalPunch} critical punch item${criticalPunch === 1 ? '' : 's'} open`] : []),
      ];
      return { id: 'commissioning-readiness', domain: 'commissioning', state: 'CRITICAL', reason: `${parts.join(', ')}.`, href, measure: { value: failed + criticalPunch } };
    }
    if (majorPunch > 0) {
      return { id: 'commissioning-readiness', domain: 'commissioning', state: 'AT_RISK', reason: `${majorPunch} major punch item${majorPunch === 1 ? '' : 's'} open.`, href, measure: { value: majorPunch } };
    }
    if (openPunch.length > 0) {
      return { id: 'commissioning-readiness', domain: 'commissioning', state: 'WATCH', reason: `${openPunch.length} punch item${openPunch.length === 1 ? '' : 's'} open.`, href, measure: { value: openPunch.length } };
    }

    const outstanding = records.length - records.filter((r) => r.status === 'commissioned').length;
    return outstanding > 0
      ? { id: 'commissioning-readiness', domain: 'commissioning', state: 'WATCH', reason: `${outstanding} of ${records.length} system${records.length === 1 ? '' : 's'} not yet commissioned.`, href, measure: { value: outstanding } }
      : { id: 'commissioning-readiness', domain: 'commissioning', state: 'CLEAR' };
  }

  async readProjectCommissioningReadiness(
    tenantId: string,
    projectId: string,
  ): Promise<{ systems: number; commissioned: number; openPunchItems: number; criticalOpenPunchItems: number }> {
    const records = await this.list(tenantId, projectId);
    const punchLists = await Promise.all(records.map((r) => this.store.listPunchItems(r.id, tenantId)));
    const openPunch = punchLists.flat().filter((p) => p.status === 'open');
    return {
      systems: records.length,
      commissioned: records.filter((r) => r.status === 'commissioned').length,
      openPunchItems: openPunch.length,
      criticalOpenPunchItems: openPunch.filter((p) => p.severity === 'critical').length,
    };
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return this.store.list(tenantId, projectId);
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    return this.store.listPaged(tenantId, page, projectId);
  }

  /**
   * Record a system's test tally by hand.
   *
   * REFUSED once the system has an itemized test sheet. A typed `pointsPassed` used to overwrite the
   * tally that `syncTally` derives from the test points, and `commission()` gates on that tally — so
   * typing "12 of 12" over a sheet whose points had failed made a failed system commissionable. The
   * evidence and the summary were two separate truths, and the weaker one won.
   *
   * The path stays open for systems tested WITHOUT a sheet (a supplier certificate for a small
   * system, say): there is no itemized truth to contradict, so a tally is the only record there is.
   * The moment a point exists, the sheet is the truth and this refuses rather than competing with it.
   */
  async recordTest(
    id: string,
    tenantId: string,
    patch: { pointsPassed: number; pointsTotal?: number; testDate?: string | null; remarks?: string | null },
  ): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const items = await this.store.listTestItems(id, tenantId);
    if (items.length > 0) {
      // Phrased as a state-transition guard on purpose: `only … can …` is the shape the error
      // taxonomy classifies as 409, and this IS a conflict with the aggregate's state rather than
      // bad input. The first wording read as prose and escaped to 500 until the browser proof
      // caught it — see apps/api/src/error-taxonomy.fitness.test.ts.
      throw new Error(
        `only a system without an itemized test sheet can have its tally entered by hand — ` +
          `${rec.code} has ${items.length} test point${items.length === 1 ? '' : 's'}; record results against them and the tally is derived`,
      );
    }
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

    // Eligibility is re-derived from the EVIDENCE here, not read from the stored tally. The domain
    // guard below still checks the tally, but a tally is a number on the record — this asks the test
    // points themselves, so a system can never be signed off while a point stands failed or was
    // never executed, whatever the tally happens to say.
    const items = await this.store.listTestItems(id, tenantId);
    if (items.length > 0) {
      const failed = items.filter((i) => i.result === 'fail');
      const untested = items.filter((i) => i.result === 'pending');
      if (failed.length > 0 || untested.length > 0) {
        const parts = [
          ...(failed.length > 0 ? [`${failed.length} test point${failed.length === 1 ? '' : 's'} still failing (${failed.map((i) => i.pointNo).join(', ')})`] : []),
          ...(untested.length > 0 ? [`${untested.length} never executed (${untested.map((i) => i.pointNo).join(', ')})`] : []),
        ];
        throw new Error(`only a system whose every test point has passed can be commissioned — ${parts.join('; ')}`);
      }
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

  /**
   * Execute a test point: APPEND a run, then re-project the point and re-derive the record's tally.
   *
   * A retest does not replace the failure it corrects. Run #1 FAILED stays exactly as recorded, run
   * #2 PASSED is appended beside it, and the point now reads pass because the latest run passed. The
   * history survives review, dispute and audit, which is the only reason the sheet exists.
   */
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

    const priorRuns = await this.store.listTestRunsForItem(itemId, tenantId);
    const run = makeTestRun({
      tenantId,
      companyId: item.companyId,
      testItemId: item.id,
      commissioningId: rec.id,
      projectId: item.projectId,
      runNo: priorRuns.length + 1,
      result: input.result,
      actual: input.actual,
      remarks: input.remarks,
      testedBy: input.testedBy,
    });
    await this.store.appendTestRun(run);

    const updated = applyLatestRun(item, run);
    await this.store.saveTestItem(updated);
    await this.syncTally(rec, tenantId);

    // Audited as its own fact. The record-level events say a system was commissioned; this says what
    // was proven, when, by whom, and — on a retest — that something had failed first.
    await this.events.append([
      makeEvent({
        type: 'commissioning.test-run.recorded',
        tenantId,
        companyId: item.companyId,
        actorId: input.testedBy ?? null,
        aggregateType: 'commissioning.record',
        aggregateId: rec.id,
        payload: {
          testItemId: item.id,
          pointNo: item.pointNo,
          runNo: run.runNo,
          result: run.result,
          actual: run.actual,
          remarks: run.remarks,
          isRetest: run.runNo > 1,
        },
      }),
    ]);
    this.logger.log(`[Commissioning] ${rec.code} point ${item.pointNo} run #${run.runNo}: ${run.result}`);
    return updated;
  }

  listTestRuns(id: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.store.listTestRuns(id, tenantId);
  }

  listTestRunsForItem(itemId: string, tenantId: string): Promise<CommissioningTestRun[]> {
    return this.store.listTestRunsForItem(itemId, tenantId);
  }

  /**
   * Roll the itemized results up into the record's pointsTotal/pointsPassed (+ derived status).
   *
   * This is the ONLY writer of the tally once a sheet exists — `recordTest` refuses in that case —
   * so the number on the record can no longer disagree with the evidence under it. A point reading
   * `fail` is its latest run failing, so a system whose defect has been retested and passed leaves
   * `failed` on its own, without anyone editing history to get there.
   */
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

  /**
   * The commissioning 360: the record with its test sheet, its run lineage and its punch list.
   *
   * `testRuns` comes back with the rest rather than behind a per-point call, so the page that has to
   * show "failed, then passed" can render it without N+1 requests — and so a reader cannot be shown
   * the current results without the history that produced them.
   */
  async getDetail(
    id: string,
    tenantId: string,
  ): Promise<{ record: CommissioningRecord; testItems: CommissioningTestItem[]; testRuns: CommissioningTestRun[]; punchItems: PunchItem[] } | null> {
    const record = await this.store.find(id, tenantId);
    if (!record) return null;
    const [testItems, testRuns, punchItems] = await Promise.all([
      this.store.listTestItems(id, tenantId),
      this.store.listTestRuns(id, tenantId),
      this.store.listPunchItems(id, tenantId),
    ]);
    return { record, testItems, testRuns, punchItems };
  }

  private async mustFind(id: string, tenantId: string): Promise<CommissioningRecord> {
    const rec = await this.store.find(id, tenantId);
    if (!rec) throw new Error(`not found: commissioning record ${id}`);
    return rec;
  }
}
