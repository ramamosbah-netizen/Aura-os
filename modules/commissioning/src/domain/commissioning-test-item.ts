import { type Id, newId } from '@aura/shared';

/**
 * A single line on a commissioning test sheet — one verifiable check on the system under test:
 * the expected result vs the actual, and the pass/fail outcome. The record's aggregate
 * pointsTotal/pointsPassed tally is the roll-up of these items; the items are the evidence.
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

/** Record the actual result of a test point. A fail must carry a remark so the retest is traceable. */
export function recordResult(
  item: CommissioningTestItem,
  input: { result: 'pass' | 'fail'; actual?: string | null; remarks?: string | null; testedBy?: Id | null },
): CommissioningTestItem {
  if (input.result !== 'pass' && input.result !== 'fail') throw new Error('result must be pass or fail');
  if (input.result === 'fail' && !input.remarks?.trim()) {
    throw new Error('a failed test point requires remarks explaining the failure');
  }
  return {
    ...item,
    result: input.result,
    actual: input.actual?.trim() || item.actual,
    remarks: input.remarks?.trim() || item.remarks,
    testedBy: input.testedBy ?? item.testedBy,
    testedAt: new Date().toISOString(),
  };
}
