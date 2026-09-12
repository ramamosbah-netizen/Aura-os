import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { type PunchItem, type PunchSeverity, makePunchItem, closePunch, escalateToQuality } from './domain/punch-item';
import { type CommissioningItpLink, makeItpLink } from './domain/commissioning-itp-link';
import { type AsBuiltLink, makeAsBuiltLink } from './domain/asbuilt-link';
import { type CertificateLink, makeCertificateLink } from './domain/certificate-link';
import { type ControlledDocumentFact, AS_BUILT_STATUS, referenceIsSound, resolveDocumentReference } from './domain/document-reference';
import { assessSystemReadiness, type SystemReadiness } from './domain/commissioning-readiness';
import {
  ELV_EQUIPMENT, QUALITY_EVIDENCE, ENGINEERING_RELEASE, DOC_CONTROL,
  type ElvEquipmentPort, type QualityEvidencePort, type EngineeringReleasePort, type DocControlPort,
  type EquipmentFact, type ItpFact, type NcrFact, type SnagFact,
} from './ports';

/** Put a certificate link back to the register. Shared by the detail read and the workspace. */
export function resolveCertificate(
  link: { id: string; documentId: string },
  documents: ControlledDocumentFact[] | null,
): LinkedCertificate {
  const resolved = resolveDocumentReference(link.documentId, documents);
  const doc = resolved?.document ?? null;
  const current = referenceIsSound(resolved);
  return {
    linkId: link.id,
    documentId: link.documentId,
    documentNumber: doc?.documentNumber ?? null,
    title: doc?.title ?? null,
    revision: doc?.revision ?? null,
    status: doc?.status ?? null,
    current,
    note: current
      ? null
      : documents === null
        ? 'Document control could not be read, so this certificate is unverified.'
        : resolved === null || resolved.missing
          ? `No document "${link.documentId}" is in the project register.`
          : 'The register has superseded the revision this points at.',
  };
}

/**
 * A test point that stands failed, with the run that failed it and any defect already raised
 * against it. This is the Defects & Retests surface's unit of work: the failure is the evidence,
 * the defect is the response, and showing them apart is how one problem looks like two.
 */
export interface FailingPointView {
  pointId: string;
  pointNo: string;
  description: string;
  expected: string | null;
  lastRunNo: number;
  lastActual: string | null;
  lastRemarks: string | null;
  lastTestedAt: string;
  /** Runs recorded so far — a point failing on run #3 has been round the loop twice. */
  runCount: number;
  /** Open defects already raised FROM this failure. Empty means the failure has no response yet. */
  openPunchIds: string[];
}

/** One system's standing in the T&C workspace — all derived, nothing stored. */
export interface CommissioningSystemView {
  record: CommissioningRecord;
  pointsTotal: number;
  pointsPassed: number;
  pointsFailing: number;
  pointsUntested: number;
  /** Points whose lineage contains a failure, whatever they read now — the retest history. */
  pointsEverFailed: number;
  retestsRequired: number;
  openPunch: number;
  eligible: boolean;
  commissioned: boolean;
  blockers: string[];
  failingPoints: FailingPointView[];
  /**
   * The wider handover question (TC-GATE-3), deliberately distinct from `eligible` above.
   *
   * `eligible` asks "may I sign this system off?" from T&C's own evidence. This asks "is it
   * COMMISSIONING READY?", which also needs the ELV register, Engineering and Quality. A system can
   * be legitimately commissioned and still not be ready — drawings never released, a non-conformance
   * open against it — and collapsing the two would make one of them a lie.
   */
  readiness: SystemReadiness;
  /** The ITP requirements a person has linked to this system, with Quality's own result for each. */
  itpRequirements: LinkedItpRequirement[];
  /** The drawings linked as this system's as-built, with what the register says about each now. */
  asBuiltRecords: LinkedAsBuilt[];
  /** The controlled document this system's evidence pack is registered as, or null (TC-GATE-10). */
  certificate: LinkedCertificate | null;
}

/**
 * A drawing somebody linked as this system's as-built (TC-GATE-8), resolved against the register.
 *
 * Everything except `linkId` and `documentId` is read from document control at the moment of the
 * read and kept nowhere — so a drawing that has been superseded or renumbered says so, instead of
 * showing whatever was true on the day it was linked.
 */
/**
 * The controlled document a system's evidence pack is registered as (TC-GATE-10).
 *
 * Resolved from the register at the moment it is shown and stored nowhere, so a certificate that has
 * been superseded says so rather than showing what was true when it was linked.
 */
export interface LinkedCertificate {
  linkId: string;
  documentId: string;
  documentNumber: string | null;
  title: string | null;
  revision: string | null;
  status: string | null;
  /**
   * Resolves and is not superseded.
   *
   * No particular register STATUS is demanded, unlike an as-built: `RegisterStatus` is drawing-shaped
   * and a test certificate has no honest value in it. Superseded is the one state that makes handing
   * it over wrong, and it is the one this tests.
   */
  current: boolean;
  /** Why it does not count, in words a reader can act on. Null when it does. */
  note: string | null;
}

export interface LinkedAsBuilt {
  linkId: string;
  documentId: string;
  documentNumber: string | null;
  title: string | null;
  revision: string | null;
  status: string | null;
  /** Resolves, is not superseded, and is actually marked as-built. */
  current: boolean;
  /** Why it does not count, in words a reader can act on. Null when it does. */
  note: string | null;
}

/** One Quality ITP requirement, linked to this system by a person, shown with Quality's result. */
export interface LinkedItpRequirement {
  linkId: string;
  itpId: string;
  reference: string;
  title: string;
  pointIndex: number | null;
  activity: string;
  pointType: string;
  acceptanceCriteria: string;
  /** Quality's result for the point — pending | passed | failed. T&C never writes it. */
  result: string;
  /** The commissioning test point nominated as proof, when one has been. */
  testItemId: string | null;
  testPointNo: string | null;
}

export interface CommissioningWorkspaceView {
  systems: CommissioningSystemView[];
  totals: {
    inScope: number;
    notStarted: number;
    noTestPoints: number;
    failing: number;
    retestsRequired: number;
    openPunch: number;
    eligible: number;
    commissioned: number;
    /** Systems whose whole readiness chain is satisfied — the number Handover reads. */
    commissioningReady: number;
  };
}

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
    // The three domains T&C READS for pre-commissioning readiness. Optional by design: an absent or
    // throwing port becomes null, and the readiness chain renders null as UNKNOWN — which blocks. A
    // gate nobody can answer must never read as satisfied (see domain/commissioning-readiness).
    @Optional() @Inject(ELV_EQUIPMENT) private readonly elv?: ElvEquipmentPort,
    @Optional() @Inject(QUALITY_EVIDENCE) private readonly quality?: QualityEvidencePort,
    @Optional() @Inject(ENGINEERING_RELEASE) private readonly engineering?: EngineeringReleasePort,
    // Document control, for as-built links (TC-GATE-8). Read only to CHECK a link before it is
    // written — the register is never copied here. Absent means the check cannot run, which lets the
    // link be recorded and leaves the readiness chain to report it unverified. An unwired port must
    // block proof, never work.
    @Optional() @Inject(DOC_CONTROL) private readonly docControl?: DocControlPort,
  ) {}

  /** Read a neighbouring domain without letting its outage fail this request. */
  private async readPort<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      // Logged rather than swallowed: the screen says the domain was unreadable, and the log says
      // why. A reader told "Quality could not be read" knows exactly what to chase.
      this.logger.warn(`[Commissioning] ${name} could not be read: ${error}`);
      return null;
    }
  }

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

  /**
   * Raise a defect against a system.
   *
   * `testItemId` / `sourceRunId` are optional provenance into T&C's own evidence: when a defect is
   * raised from a failing run, the link is what lets the Defects surface show one problem rather
   * than a failed test and an unrelated-looking defect. A defect raised by eye carries neither, and
   * is not a lesser defect for it. The point must belong to this record — a defect pointing at
   * another system's evidence would be worse than no link at all.
   */
  async addPunchItem(
    id: string,
    tenantId: string,
    input: { description: string; severity?: PunchSeverity; location?: string | null; raisedBy?: string | null; testItemId?: string | null; sourceRunId?: string | null },
  ): Promise<PunchItem> {
    const rec = await this.mustFind(id, tenantId);
    if (input.testItemId) {
      const point = await this.store.findTestItem(input.testItemId, tenantId);
      if (!point || point.commissioningId !== rec.id) {
        throw new Error(`not found: test point ${input.testItemId} on this commissioning record`);
      }
    }
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
  ): Promise<{
    record: CommissioningRecord;
    testItems: CommissioningTestItem[];
    testRuns: CommissioningTestRun[];
    punchItems: PunchItem[];
    /** The controlled document this pack is registered as, resolved now (TC-GATE-10). */
    certificate: LinkedCertificate | null;
  } | null> {
    const record = await this.store.find(id, tenantId);
    if (!record) return null;
    const [testItems, testRuns, punchItems, link] = await Promise.all([
      this.store.listTestItems(id, tenantId),
      this.store.listTestRuns(id, tenantId),
      this.store.listPunchItems(id, tenantId),
      this.store.findCertificateLink(id, tenantId),
    ]);
    const documents = link ? await this.readDocuments(tenantId, record.projectId) : null;
    return { record, testItems, testRuns, punchItems, certificate: link ? resolveCertificate(link, documents) : null };
  }

  // ── The workspace read model (TC-GATE-2) ─────────────────────────────────────────────────────

  /**
   * What stands between a project and commissioning, computed from the authoritative evidence.
   *
   * A READ MODEL, not a new authority: every number here is derived from records, test points, runs
   * and punch items at the moment it is asked. Nothing is stored, nothing is hand-ticked, and there
   * is no "readiness" flag anyone can set — the previous generation of this kind of surface counted
   * booleans and told people what they had typed rather than what was true.
   *
   * Three queries rather than one per system: a project with fifty systems must not cost fifty
   * round trips to answer one screen.
   */
  async readWorkspace(tenantId: string, projectId?: string): Promise<CommissioningWorkspaceView> {
    const [records, items, runs, punch, itpLinks, asBuiltLinks, certificateLinks, equipment, qualityEvidence, drawings, documents] = await Promise.all([
      this.store.list(tenantId, projectId),
      this.store.listTestItemsForProject(tenantId, projectId),
      this.store.listTestRunsForProject(tenantId, projectId),
      this.store.listPunchItemsForProject(tenantId, projectId),
      this.store.listItpLinksForProject(tenantId, projectId),
      this.store.listAsBuiltLinksForProject(tenantId, projectId),
      this.store.listCertificateLinksForProject(tenantId, projectId),
      // The three neighbouring domains, read once for the whole project rather than once per system.
      // Each is null when its port is unbound or errors, and null becomes UNKNOWN downstream.
      projectId && this.elv ? this.readPort('ELV device register', () => this.elv!.readProjectEquipment(tenantId, projectId)) : Promise.resolve(null),
      projectId && this.quality ? this.readPort('Quality', () => this.quality!.readProjectQualityEvidence(tenantId, projectId)) : Promise.resolve(null),
      projectId && this.engineering ? this.readPort('Engineering', () => this.engineering!.readProjectDrawingRelease(tenantId, projectId)) : Promise.resolve(null),
      // The controlled register, for resolving as-built links (TC-GATE-8). Null when unreadable,
      // which shows on each link as "unverified" rather than as a silent pass.
      projectId ? this.readDocuments(tenantId, projectId) : Promise.resolve(null),
    ]);
    const itpsById = new Map((qualityEvidence?.itps ?? []).map((itp) => [itp.id, itp]));
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const linksByRecord = new Map<string, typeof itpLinks>();
    for (const link of itpLinks) {
      const list = linksByRecord.get(link.commissioningId) ?? [];
      list.push(link);
      linksByRecord.set(link.commissioningId, list);
    }

    const itemsByRecord = new Map<string, CommissioningTestItem[]>();
    for (const item of items) {
      const list = itemsByRecord.get(item.commissioningId) ?? [];
      list.push(item);
      itemsByRecord.set(item.commissioningId, list);
    }
    const runsByItem = new Map<string, CommissioningTestRun[]>();
    for (const run of runs) {
      const list = runsByItem.get(run.testItemId) ?? [];
      list.push(run);
      runsByItem.set(run.testItemId, list);
    }
    const asBuiltByRecord = new Map<string, typeof asBuiltLinks>();
    for (const link of asBuiltLinks) {
      const list = asBuiltByRecord.get(link.commissioningId) ?? [];
      list.push(link);
      asBuiltByRecord.set(link.commissioningId, list);
    }

    const punchByRecord = new Map<string, PunchItem[]>();
    for (const p of punch) {
      const list = punchByRecord.get(p.commissioningId) ?? [];
      list.push(p);
      punchByRecord.set(p.commissioningId, list);
    }

    const systems: CommissioningSystemView[] = records.map((record) => {
      const points = itemsByRecord.get(record.id) ?? [];
      const openPunch = (punchByRecord.get(record.id) ?? []).filter((p) => p.status === 'open');
      const failing = points.filter((p) => p.result === 'fail');
      const untested = points.filter((p) => p.result === 'pending');
      const passed = points.filter((p) => p.result === 'pass');
      // A retest is owed where a point stands failed. Counting runs instead would count history.
      const retestsRequired = failing.length;
      const everFailed = points.filter((p) => (runsByItem.get(p.id) ?? []).some((r) => r.result === 'fail')).length;

      // The blockers, in the words the person reading them can act on. Order matters: this is the
      // sentence the Overview shows, and the first item should be the one to do next.
      const blockers: string[] = [];
      if (points.length === 0) blockers.push('No test points defined');
      if (untested.length > 0) blockers.push(`${untested.length} test point${untested.length === 1 ? '' : 's'} never executed`);
      if (failing.length > 0) blockers.push(`${failing.length} test point${failing.length === 1 ? '' : 's'} failing — retest required`);
      if (openPunch.length > 0) blockers.push(`${openPunch.length} open punch item${openPunch.length === 1 ? '' : 's'}`);

      const failingPoints: FailingPointView[] = failing.map((point) => {
        const lineage = runsByItem.get(point.id) ?? [];
        const last = lineage.reduce<CommissioningTestRun | null>((latest, r) => (latest && latest.runNo >= r.runNo ? latest : r), null);
        return {
          pointId: point.id,
          pointNo: point.pointNo,
          description: point.description,
          expected: point.expected,
          lastRunNo: last?.runNo ?? 0,
          lastActual: last?.actual ?? null,
          lastRemarks: last?.remarks ?? null,
          lastTestedAt: last?.testedAt ?? point.createdAt,
          runCount: lineage.length,
          openPunchIds: openPunch.filter((p) => p.testItemId === point.id).map((p) => p.id),
        };
      });

      // The drawings tied to this system as its as-built. Document control's answer is carried
      // through untouched — T&C shows it, and never writes it.
      const asBuiltRecords: LinkedAsBuilt[] = (asBuiltByRecord.get(record.id) ?? []).map((link) => {
        const resolved = resolveDocumentReference(link.documentId, documents);
        const doc = resolved?.document ?? null;
        const current = referenceIsSound(resolved) && doc!.status === AS_BUILT_STATUS;
        return {
          linkId: link.id,
          documentId: link.documentId,
          documentNumber: doc?.documentNumber ?? null,
          title: doc?.title ?? null,
          revision: doc?.revision ?? null,
          status: doc?.status ?? null,
          current,
          note: current
            ? null
            : documents === null
              ? 'Document control could not be read, so this link is unverified.'
              : resolved === null || resolved.missing
                ? `No document "${link.documentId}" is in the project register.`
                : resolved.superseded
                  ? 'The register has superseded the revision this points at.'
                  : `The register has this as '${doc!.status}', not an as-built.`,
        };
      });

      // The controlled document this system's pack is registered as, if a person has said so.
      const certificateLink = certificateLinks.find((l) => l.commissioningId === record.id) ?? null;
      const certificate = certificateLink ? resolveCertificate(certificateLink, documents) : null;

      // The Quality requirements a person has tied to this system. Quality's own result is carried
      // through untouched — T&C shows it, and never writes it.
      const itpRequirements: LinkedItpRequirement[] = (linksByRecord.get(record.id) ?? []).flatMap((link) => {
        const itp = itpsById.get(link.itpId);
        if (!itp) return [];
        const indexes = link.pointIndex == null ? itp.points.map((_, i) => i) : [link.pointIndex];
        return indexes.flatMap((index) => {
          const point = itp.points[index];
          if (!point) return [];
          const testItem = link.testItemId ? itemsById.get(link.testItemId) : undefined;
          return [{
            linkId: link.id,
            itpId: itp.id,
            reference: itp.reference,
            title: itp.title,
            pointIndex: index,
            activity: point.activity,
            pointType: point.pointType,
            acceptanceCriteria: point.acceptanceCriteria,
            result: point.result,
            testItemId: link.testItemId,
            testPointNo: testItem?.pointNo ?? null,
          }];
        });
      });

      const readiness = assessSystemReadiness({
        system: record.system,
        pointsTotal: points.length,
        pointsPassed: passed.length,
        pointsFailing: failing.length,
        pointsUntested: untested.length,
        pointsEverFailed: everFailed,
        openPunch: openPunch.length,
        commissioned: record.status === 'commissioned',
        signedOffBy: record.commissionedBy,
        witnessedBy: record.witnessedBy,
        equipment: equipment === null ? null : equipment.map((d) => ({
          tag: d.tag,
          system: d.system,
          status: d.status,
          linked: d.commissioningRecordId === record.id,
        })),
        drawings: drawings === null ? null : drawings,
        ncrs: qualityEvidence === null ? null : qualityEvidence.ncrs.map((n) => ({ ncrNumber: n.ncrNumber, system: n.system, status: n.status })),
        itpRequirements: itpRequirements.map((r) => ({ reference: r.reference, activity: r.activity, pointType: r.pointType, result: r.result })),
      });

      return {
        record,
        failingPoints,
        readiness,
        itpRequirements,
        asBuiltRecords,
        certificate,
        pointsTotal: points.length,
        pointsPassed: passed.length,
        pointsFailing: failing.length,
        pointsUntested: untested.length,
        pointsEverFailed: everFailed,
        retestsRequired,
        openPunch: openPunch.length,
        // Eligibility asks the same question `commission()` asks, so the screen and the guard can
        // never disagree about who is ready.
        eligible: record.status !== 'commissioned' && points.length > 0 && failing.length === 0 && untested.length === 0 && openPunch.length === 0,
        commissioned: record.status === 'commissioned',
        blockers,
      };
    });

    return {
      systems,
      totals: {
        inScope: systems.length,
        notStarted: systems.filter((s) => !s.commissioned && s.pointsTotal > 0 && s.pointsPassed === 0 && s.pointsFailing === 0).length,
        noTestPoints: systems.filter((s) => !s.commissioned && s.pointsTotal === 0).length,
        failing: systems.filter((s) => s.pointsFailing > 0).length,
        retestsRequired: systems.reduce((sum, s) => sum + s.retestsRequired, 0),
        openPunch: systems.reduce((sum, s) => sum + s.openPunch, 0),
        eligible: systems.filter((s) => s.eligible).length,
        commissioned: systems.filter((s) => s.commissioned).length,
        commissioningReady: systems.filter((s) => s.readiness.commissioningReady).length,
      },
    };
  }

  /** Every defect on the project with its provenance, for the Defects & Retests surface. */
  async listProjectPunchItems(tenantId: string, projectId?: string): Promise<PunchItem[]> {
    return this.store.listPunchItemsForProject(tenantId, projectId);
  }

  // ── ITP linkage (TC-GATE-3) ──────────────────────────────────────────────────────────────────

  /**
   * Record that a Quality ITP — or one point of it — applies to this system.
   *
   * T&C writes ONLY the link. The plan, its acceptance criteria and its results stay Quality's, and
   * are read back through the evidence port. This exists because the two sides cannot be joined
   * automatically: an ITP carries a free-text discipline, a commissioning record carries the
   * canonical ElvSystem, and matching them by string would put the wrong acceptance criteria in
   * front of an engineer — worse than showing none.
   */
  async linkItp(
    id: string,
    tenantId: string,
    input: { itpId: string; pointIndex?: number | null; testItemId?: string | null; linkedBy?: string | null },
  ): Promise<CommissioningItpLink> {
    const rec = await this.mustFind(id, tenantId);
    if (input.testItemId) {
      const point = await this.store.findTestItem(input.testItemId, tenantId);
      if (!point || point.commissioningId !== rec.id) {
        throw new Error(`not found: test point ${input.testItemId} on this commissioning record`);
      }
    }
    const link = makeItpLink({
      tenantId,
      companyId: rec.companyId,
      commissioningId: rec.id,
      projectId: rec.projectId,
      itpId: input.itpId,
      pointIndex: input.pointIndex,
      testItemId: input.testItemId,
      linkedBy: input.linkedBy,
    });
    await this.store.saveItpLink(link);
    this.logger.log(`[Commissioning] ${rec.code} linked to ITP ${input.itpId}${input.pointIndex == null ? '' : ` point ${input.pointIndex}`}`);
    return link;
  }

  async unlinkItp(id: string, linkId: string, tenantId: string): Promise<void> {
    await this.mustFind(id, tenantId);
    await this.store.deleteItpLink(linkId, tenantId);
  }

  // ── As-built links (TC-GATE-8) ───────────────────────────────────────────────────────────────

  /**
   * Record that a controlled drawing is this system's as-built.
   *
   * CHECKED AT THE MOMENT IT IS MADE, when document control can be read: the entry must exist in
   * this project's register, and it must actually be marked `as_built`. Linking a drawing that is
   * still for-construction would put a not-yet-as-built document behind an as-built claim, which is
   * the failure this whole link exists to prevent — so it is refused here rather than discovered
   * later by a reader.
   *
   * When the port is absent the link is still recorded. The readiness chain re-checks it on every
   * read and reports what it finds; an unwired port must not stop work being written down.
   */
  async linkAsBuilt(
    id: string,
    tenantId: string,
    input: { documentId: string; linkedBy?: string | null },
  ): Promise<AsBuiltLink> {
    const rec = await this.mustFind(id, tenantId);
    const link = makeAsBuiltLink({
      tenantId,
      companyId: rec.companyId,
      commissioningId: rec.id,
      projectId: rec.projectId,
      documentId: input.documentId,
      linkedBy: input.linkedBy,
    });

    const documents = await this.readDocuments(tenantId, rec.projectId);
    const resolved = resolveDocumentReference(link.documentId, documents);
    if (resolved?.missing) {
      throw new Error(
        `validation: the document reference "${resolved.reference}" must match a controlled document ` +
          "in this project's register — by document number or id",
      );
    }
    if (resolved?.document && resolved.document.status !== AS_BUILT_STATUS) {
      throw new Error(
        `validation: document ${resolved.document.documentNumber} must be marked as-built in the register ` +
          `before it can be linked as one — it is currently '${resolved.document.status}'`,
      );
    }

    await this.store.saveAsBuiltLink(link);
    this.logger.log(`[Commissioning] ${rec.code} linked as-built ${resolved?.document?.documentNumber ?? link.documentId}`);
    return link;
  }

  async unlinkAsBuilt(id: string, linkId: string, tenantId: string): Promise<void> {
    await this.mustFind(id, tenantId);
    await this.store.deleteAsBuiltLink(linkId, tenantId);
  }

  // ── Certificate links (TC-GATE-10) ───────────────────────────────────────────────────────────

  /**
   * Record that a controlled document is this system's commissioning certificate.
   *
   * TWO GUARDS, each closing a way the record could lie:
   *
   * 1. THE SYSTEM MUST BE COMMISSIONED. A certificate for a system that has not been signed off is
   *    a claim about work that has not finished, and the register would then carry a controlled
   *    document saying so. The evidence must exist before the document that attests to it.
   *
   * 2. THE REFERENCE MUST RESOLVE, when document control can be read. A certificate pointing at
   *    nothing is exactly the failure TC-GATE-6 removed from the O&M pack.
   *
   * Unlike the as-built guard, this does NOT demand a particular register status. `RegisterStatus`
   * is drawing-shaped — draft, for_review, for_construction, superseded, as_built — and a test
   * certificate has no honest value in it. Demanding one would push people to label certificates
   * "for construction", a lie the check itself caused. Superseded is surfaced on every read instead.
   */
  async linkCertificate(
    id: string,
    tenantId: string,
    input: { documentId: string; linkedBy?: string | null },
  ): Promise<CertificateLink> {
    const rec = await this.mustFind(id, tenantId);
    if (rec.status !== 'commissioned') {
      throw new Error(
        `only a commissioned system can have its certificate registered — ${rec.code} is '${rec.status}'`,
      );
    }
    const link = makeCertificateLink({
      tenantId,
      companyId: rec.companyId,
      commissioningId: rec.id,
      projectId: rec.projectId,
      documentId: input.documentId,
      linkedBy: input.linkedBy,
    });

    const resolved = resolveDocumentReference(link.documentId, await this.readDocuments(tenantId, rec.projectId));
    if (resolved?.missing) {
      throw new Error(
        `validation: the document reference "${resolved.reference}" must match a controlled document ` +
          "in this project's register — by document number or id",
      );
    }

    await this.store.saveCertificateLink(link);
    this.logger.log(`[Commissioning] ${rec.code} certificate registered as ${resolved?.document?.documentNumber ?? link.documentId}`);
    return link;
  }

  async unlinkCertificate(id: string, linkId: string, tenantId: string): Promise<void> {
    await this.mustFind(id, tenantId);
    await this.store.deleteCertificateLink(linkId, tenantId);
  }

  listAsBuiltLinks(id: string, tenantId: string): Promise<AsBuiltLink[]> {
    return this.store.listAsBuiltLinks(id, tenantId);
  }

  /** The project register, or null when document control could not be read. */
  async readDocuments(tenantId: string, projectId: string): Promise<ControlledDocumentFact[] | null> {
    if (!this.docControl) return null;
    return this.readPort('Document control', () => this.docControl!.readProjectDocuments(tenantId, projectId));
  }

  listItpLinks(id: string, tenantId: string): Promise<CommissioningItpLink[]> {
    return this.store.listItpLinks(id, tenantId);
  }

  /** The project's ITPs and non-conformances, read from Quality. Null when Quality cannot be read. */
  async readQualityEvidence(tenantId: string, projectId: string): Promise<{ ncrs: NcrFact[]; itps: ItpFact[]; snags: SnagFact[] } | null> {
    if (!this.quality) return null;
    return this.readPort('Quality', () => this.quality!.readProjectQualityEvidence(tenantId, projectId));
  }

  /** The project's device schedule, read from the ELV register. Null when it cannot be read. */
  async readEquipment(tenantId: string, projectId: string): Promise<EquipmentFact[] | null> {
    if (!this.elv) return null;
    return this.readPort('ELV device register', () => this.elv!.readProjectEquipment(tenantId, projectId));
  }

  // ── Quality escalation seam (TC-GATE-3) ──────────────────────────────────────────────────────

  /**
   * Record that a defect needs a Quality non-conformance, and the NCR that answers it.
   *
   * T&C does not raise the NCR: that is Quality's authority and its lifecycle. This writes T&C's own
   * note about its own defect, plus a REFERENCE to the Quality record. Nothing of the NCR is copied,
   * so there is nothing here to drift out of step with Quality.
   */
  async escalatePunchItem(
    id: string,
    punchId: string,
    tenantId: string,
    input: { qualityNcrId?: string | null; escalatedBy?: string | null },
  ): Promise<PunchItem> {
    const item = await this.store.findPunchItem(punchId, tenantId);
    if (!item || item.commissioningId !== id) throw new Error(`not found: punch item ${punchId}`);
    const updated = escalateToQuality(item, input);
    await this.store.savePunchItem(updated);
    this.logger.log(`[Commissioning] defect ${punchId} escalated to Quality${input.qualityNcrId ? ` (NCR ${input.qualityNcrId})` : ''}`);
    return updated;
  }

  private async mustFind(id: string, tenantId: string): Promise<CommissioningRecord> {
    const rec = await this.store.find(id, tenantId);
    if (!rec) throw new Error(`not found: commissioning record ${id}`);
    return rec;
  }
}
