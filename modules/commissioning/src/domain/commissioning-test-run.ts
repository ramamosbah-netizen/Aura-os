import { randomUUID } from 'node:crypto';

type Id = string;

export type TestRunResult = 'pass' | 'fail';

/**
 * One EXECUTION of a test point — the authoritative unit of test evidence.
 *
 * The point itself (`CommissioningTestItem`) is a definition: what must be proven, and what the
 * acceptance value is. Proving it produces a run, and runs accumulate: a point that failed and was
 * retested has two of them. A run is never edited and never deleted — the database refuses both
 * (migration 0296) — because the whole purpose of the record is to be able to say later that the
 * system failed, what was done about it, and that it then passed.
 *
 * The point's own `result` / `actual` / `remarks` columns are a derived snapshot of the LATEST run.
 * Read them for "where does this point stand"; read the runs for "what happened".
 */
export interface CommissioningTestRun {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  testItemId: Id;
  /** Denormalised: the record a run belongs to, so a whole system's lineage is one read. */
  commissioningId: Id;
  projectId: Id;
  /** 1-based, per test point. Run 1 is the first execution, not the first failure. */
  runNo: number;
  result: TestRunResult;
  /** The value MEASURED in this run — 71.2 m, 3.4 dB, "image sharp at 4 m". Per run, never rolled up. */
  actual: string | null;
  remarks: string | null;
  testedBy: Id | null;
  testedAt: string;
  createdAt: string;
}

export interface NewCommissioningTestRun {
  tenantId: Id;
  companyId?: Id | null;
  testItemId: Id;
  commissioningId: Id;
  projectId: Id;
  runNo: number;
  result: TestRunResult;
  actual?: string | null;
  remarks?: string | null;
  testedBy?: Id | null;
  testedAt?: string;
}

/**
 * Record an execution of a test point.
 *
 * A FAILURE MUST CARRY A REMARK. This rule predates the run model and is kept deliberately: a fail
 * with no explanation is the one entry nobody can act on later, and the retest that follows it has
 * nothing to answer. A pass needs no justification — it is the measured value that speaks.
 */
export function makeTestRun(input: NewCommissioningTestRun): CommissioningTestRun {
  if (input.result !== 'pass' && input.result !== 'fail') throw new Error('validation: result must be pass or fail');
  if (input.result === 'fail' && !input.remarks?.trim()) {
    throw new Error('validation: a failed test point requires remarks explaining the failure');
  }
  if (!Number.isInteger(input.runNo) || input.runNo < 1) throw new Error('validation: runNo must be a positive integer');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    testItemId: input.testItemId,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    runNo: input.runNo,
    result: input.result,
    actual: input.actual?.trim() || null,
    remarks: input.remarks?.trim() || null,
    testedBy: input.testedBy ?? null,
    testedAt: input.testedAt ?? now,
    createdAt: now,
  };
}

/** The run that decides where a point stands: the highest run number recorded against it. */
export function latestRun(runs: readonly CommissioningTestRun[]): CommissioningTestRun | null {
  return runs.reduce<CommissioningTestRun | null>((latest, run) => (latest && latest.runNo >= run.runNo ? latest : run), null);
}

/** True once a point has been executed and its latest run passed. Pending points are not passes. */
export function passesOn(runs: readonly CommissioningTestRun[]): boolean {
  return latestRun(runs)?.result === 'pass';
}
