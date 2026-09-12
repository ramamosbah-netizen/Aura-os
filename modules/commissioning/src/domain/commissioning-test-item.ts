import { type Id, newId } from '@aura/shared';
import type { CommissioningTestRun } from './commissioning-test-run';

/**
 * A single line on a commissioning test sheet — one verifiable check on the system under test: what
 * must be proven, and the acceptance value it must meet.
 *
 * A point is a DEFINITION. Executing it produces a `CommissioningTestRun`, and runs accumulate, so a
 * point that failed and was retested keeps both. The `result` / `actual` / `remarks` / `testedBy` /
 * `testedAt` fields below are a DERIVED SNAPSHOT of the latest run, kept so every existing reader —
 * the tally, the 360, the register — still answers "where does this point stand" in one read. They
 * are a projection, never authored directly: `applyLatestRun` is the only way they change.
 *
 * The record's pointsTotal/pointsPassed tally is in turn the roll-up of these snapshots. Evidence at
 * the bottom, projection above it, tally on top — each derived from the one below, so no layer can
 * assert something the layer beneath it does not support.
 */
export type TestResult = 'pending' | 'pass' | 'fail';

export interface CommissioningTestItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  commissioningId: Id;
  projectId: Id;
  pointNo: string;
  description: string;
  expected: string | null;
  actual: string | null;
  result: TestResult;
  remarks: string | null;
  testedBy: Id | null;
  testedAt: string | null;
  createdAt: string;
}

export interface NewCommissioningTestItem {
  tenantId: Id;
  companyId?: Id | null;
  commissioningId: Id;
  projectId: Id;
  pointNo: string;
  description: string;
  expected?: string | null;
}

export function makeTestItem(input: NewCommissioningTestItem): CommissioningTestItem {
  if (!input.pointNo?.trim()) throw new Error('pointNo is required');
  if (!input.description?.trim()) throw new Error('description is required');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    pointNo: input.pointNo.trim(),
    description: input.description.trim(),
    expected: input.expected?.trim() || null,
    actual: null,
    result: 'pending',
    remarks: null,
    testedBy: null,
    testedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Project a recorded run onto the point's snapshot.
 *
 * Every field is taken from the run VERBATIM, including a null `actual`. Carrying the previous
 * measurement forward — which the pre-run-model code did — would report a value on the same line as
 * a result that did not produce it, and a reader has no way to tell. The earlier measurement is not
 * lost: it is on run #1, where it belongs, and the 360 shows it.
 */
export function applyLatestRun(item: CommissioningTestItem, run: CommissioningTestRun): CommissioningTestItem {
  return {
    ...item,
    result: run.result,
    actual: run.actual,
    remarks: run.remarks,
    testedBy: run.testedBy,
    testedAt: run.testedAt,
  };
}
