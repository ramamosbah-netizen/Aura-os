import { type Id, newId } from '@aura/shared';

// Commissioning domain — framework-free. A CommissioningRecord tracks the Test &
// Commissioning (T&C) of one ELV system (or sub-system) on a project: the step that
// turns "installed" into "works and is accepted". It is the ELV deliverable that unlocks
// handover and the final payment — hence the witness (consultant/client) and the pass/total
// test-point tally. Distinct from a Quality inspection (QA of workmanship): commissioning
// proves the *system* performs to specification.

export type ElvSystem =
  | 'cctv'
  | 'access_control'
  | 'fire_alarm'
  | 'pa_va'
  | 'bms'
  | 'network'
  | 'intercom'
  | 'structured_cabling'
  | 'audio_visual'
  | 'other';

/** pending → in_progress → tested → commissioned. `failed` is a terminal-until-retested state. */
export type CommissioningStatus = 'pending' | 'in_progress' | 'tested' | 'commissioned' | 'failed';

export const ELV_SYSTEMS: ElvSystem[] = [
  'cctv', 'access_control', 'fire_alarm', 'pa_va', 'bms', 'network',
  'intercom', 'structured_cabling', 'audio_visual', 'other',
];

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
  commissionedBy: string | null;
  /** The consultant/client representative who witnessed sign-off. */
  witnessedBy: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
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

function toSystem(v: unknown): ElvSystem {
  return (ELV_SYSTEMS as string[]).includes(v as string) ? (v as ElvSystem) : 'other';
}

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
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
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
): CommissioningRecord {
  if (rec.status === 'commissioned') {
    throw new Error('conflict: record is already commissioned');
  }
  if (rec.pointsTotal > 0 && rec.pointsPassed < rec.pointsTotal) {
    throw new Error('only a system with all test points passed can be commissioned');
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
