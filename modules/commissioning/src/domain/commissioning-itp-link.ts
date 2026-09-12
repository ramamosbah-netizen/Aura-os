import { type Id, newId } from '@aura/shared';

/**
 * T&C's record that a Quality ITP applies to one of its systems (TC-GATE-3).
 *
 * Quality owns the Inspection & Test Plan — its points, their acceptance criteria and their results.
 * This owns nothing of that. It is one sentence, written by a person: *this plan (or this point of
 * it) applies to this system, and this commissioning test point proves it.*
 *
 * It exists because the two sides cannot be joined automatically: an ITP carries free-text
 * `discipline`, a commissioning record carries the canonical `ElvSystem`. Matching them by string
 * would put the wrong acceptance criteria in front of an engineer, which is worse than showing none.
 */
export interface CommissioningItpLink {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  commissioningId: Id;
  projectId: Id;
  /** The Quality ITP. Read-only from here — T&C never writes the plan or its results. */
  itpId: Id;
  /** Which point of the plan; null means the whole plan applies to this system. */
  pointIndex: number | null;
  /** The commissioning test point that proves this requirement, when one has been nominated. */
  testItemId: Id | null;
  linkedBy: Id | null;
  createdAt: string;
}

export interface NewCommissioningItpLink {
  tenantId: Id;
  companyId?: Id | null;
  commissioningId: Id;
  projectId: Id;
  itpId: Id;
  pointIndex?: number | null;
  testItemId?: Id | null;
  linkedBy?: Id | null;
}

export function makeItpLink(input: NewCommissioningItpLink): CommissioningItpLink {
  if (!input.itpId?.trim()) throw new Error('validation: itpId is required');
  if (input.pointIndex != null && (!Number.isInteger(input.pointIndex) || input.pointIndex < 0)) {
    throw new Error('validation: pointIndex must be a non-negative integer');
  }
  // A test point can only prove a SPECIFIC requirement. Nominating one against a whole plan would
  // claim that one test satisfies every point in it.
  if (input.testItemId && input.pointIndex == null) {
    throw new Error('validation: a test point can only be linked to a specific ITP point, not to the whole plan');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    itpId: input.itpId,
    pointIndex: input.pointIndex ?? null,
    testItemId: input.testItemId ?? null,
    linkedBy: input.linkedBy ?? null,
    createdAt: new Date().toISOString(),
  };
}
