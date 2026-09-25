import { type Id, newId, ELV_SYSTEMS, type ElvSystem, toElvSystem } from '@aura/shared';

// Commissioning domain — framework-free. A CommissioningRecord tracks the Test &
// Commissioning (T&C) of one ELV system (or sub-system) on a project: the step that
// turns "installed" into "works and is accepted". It is the ELV deliverable that unlocks
// handover and the final payment — hence the witness (consultant/client) and the pass/total
// test-point tally. Distinct from a Quality inspection (QA of workmanship): commissioning
// proves the *system* performs to specification.

// ElvSystem now comes from @aura/shared. This module carried its own union for months and the two
// drifted — it had `network`, which shared lacked, and spells voice alarm `pa_va`. Both are
// reconciled in shared (the value is added; the spelling is an alias), and re-exported here so
// every existing importer keeps working.
export { ELV_SYSTEMS, type ElvSystem };

/** pending → in_progress → tested → commissioned. `failed` is a terminal-until-retested state. */
export type CommissioningStatus = 'pending' | 'in_progress' | 'tested' | 'commissioned' | 'failed';


export interface CommissioningRecord {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  code: string;
  title: string;
  system: ElvSystem;
  location: string | null;
  status: CommissioningStatus;
  /** Test-point tally — the objective measure of how much of the system is proven. */
  pointsTotal: number;
  pointsPassed: number;
  testDate: string | null;
  remarks: string | null;
  commissionedAt: string | null;
  /** The engineer who signed off. A LABEL, like `witnessedBy` — not the AURA user. */
  commissionedBy: string | null;
  /** The consultant/client representative who witnessed sign-off. */
  witnessedBy: string | null;
  /**
   * WHO RECORDED THE SIGN-OFF in AURA.
   *
   * The commission route took no actor at all, so the act that closes a system's testing was
   * performed by nobody as far as the record knew — while two free-text names sat beside it
   * looking like attribution. `commissionedBy` and `witnessedBy` name the people who SIGNED, and
   * a consultant's witness holds no AURA account; this is the user who entered it, and no
   * certificate may present one as the other.
   */
  commissionRecordedBy: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The approved system-ITP revision this record executes (TC-08/TC-09) — pinned for good once
   * bound. Null on a record that has not been bound, which can therefore never be commissioned.
   */
  itpId: Id | null;
  itpRevision: number | null;
  itpBoundBy: Id | null;
  itpBoundAt: string | null;
}

export interface NewCommissioningRecord {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  code: string;
  title: string;
  system?: ElvSystem;
  location?: string | null;
  pointsTotal?: number;
  createdBy?: Id | null;
}

// Alias-aware: rows written as `pa_va` before the taxonomies merged must not silently become
// `other`.
const toSystem = toElvSystem;

export function makeCommissioningRecord(input: NewCommissioningRecord): CommissioningRecord {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    system: toSystem(input.system),
    location: input.location?.trim() || null,
    status: 'pending',
    pointsTotal: Math.max(0, Math.floor(input.pointsTotal ?? 0)),
    pointsPassed: 0,
    testDate: null,
    remarks: null,
    commissionedAt: null,
    commissionedBy: null,
    witnessedBy: null,
    commissionRecordedBy: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
    itpId: null,
    itpRevision: null,
    itpBoundBy: null,
    itpBoundAt: null,
  };
}

/**
 * Record a test pass. Moves the record to `tested` when every point passes, otherwise
 * `in_progress`. Clamps passed to [0, total]. Does not touch a commissioned record.
 */
export function recordTest(
  rec: CommissioningRecord,
  patch: { pointsPassed: number; pointsTotal?: number; testDate?: string | null; remarks?: string | null },
): CommissioningRecord {
  if (rec.status === 'commissioned') {
    throw new Error('conflict: record is already commissioned');
  }
  const total = Math.max(0, Math.floor(patch.pointsTotal ?? rec.pointsTotal));
  const passed = Math.min(Math.max(0, Math.floor(patch.pointsPassed)), total);
  const allPassed = total > 0 && passed >= total;
  return {
    ...rec,
    pointsTotal: total,
    pointsPassed: passed,
    status: allPassed ? 'tested' : 'in_progress',
    testDate: patch.testDate ?? rec.testDate ?? new Date().toISOString().slice(0, 10),
    remarks: patch.remarks ?? rec.remarks,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Commission (sign off). Guard: every test point must have passed — you cannot commission
 * a system that has not fully passed its test. Requires a witness for an auditable record.
 */
export function commission(
  rec: CommissioningRecord,
  patch: { commissionedBy: string; witnessedBy: string },
  recordedBy: string | null = null,
): CommissioningRecord {
  if (rec.status === 'commissioned') {
    throw new Error('conflict: record is already commissioned');
  }
  // The approved checklist (TC-08/TC-09): nothing is commissioned on points nobody approved. What the
  // points themselves say is re-derived from the evidence by the service (`checklistPassGaps`) and
  // held again by PostgreSQL — a tally on the record is not evidence.
  if (!rec.itpId) {
    throw new Error('only a system bound to an approved ITP revision can be commissioned — bind it to the approved revision for its system first');
  }
  if (!patch.commissionedBy?.trim() || !patch.witnessedBy?.trim()) {
    throw new Error('validation: commissionedBy and witnessedBy are required to sign off');
  }
  const now = new Date().toISOString();
  return {
    ...rec,
    status: 'commissioned',
    commissionedBy: patch.commissionedBy.trim(),
    witnessedBy: patch.witnessedBy.trim(),
    commissionRecordedBy: recordedBy,
    commissionedAt: now,
    updatedAt: now,
  };
}

/** Mark a failed test — records the reason so the retest is traceable. */
export function fail(rec: CommissioningRecord, reason: string): CommissioningRecord {
  if (rec.status === 'commissioned') {
    throw new Error('conflict: record is already commissioned');
  }
  return {
    ...rec,
    status: 'failed',
    remarks: reason?.trim() || rec.remarks,
    updatedAt: new Date().toISOString(),
  };
}
