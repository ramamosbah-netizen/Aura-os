import { type Id, newId } from '@aura/shared';

/**
 * WHAT T&C ESCALATES, QUALITY RECEIVES AND DECIDES (TC-08, the owner's decision of 2026-09-25).
 *
 * T&C never raises a non-conformance. When a commissioning defect may be one, T&C ASKS — and the ask
 * lands here, in QA/QC's queue for the project, as Quality's own record. Quality then decides it:
 * either raises an NCR from it (the NCR is Quality's, linked back to the defect and its failing run),
 * or records, with a reason, that it is not a non-conformance. T&C reads the outcome; it writes none.
 *
 * The person who asked does not decide. A decision is final: the escalation is immutable once decided
 * (migration 0390 holds the same rules).
 */

export type EscalationStatus = 'pending' | 'ncr_raised' | 'not_nonconformance';

export interface QualityEscalation {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  sourceType: 'commissioning.punch';
  /** The commissioning defect this asks about — a reference, never a copy of its lifecycle. */
  sourceId: Id;
  /** The system code, as T&C knows it, for a person reading the queue. */
  sourceReference: string | null;
  system: string | null;
  description: string;
  severity: string | null;
  /** The failing evidence, as it stood when T&C asked. */
  pointNo: string | null;
  failingRunNo: number | null;
  failingActual: string | null;
  failingRemarks: string | null;
  requestedBy: Id;
  requestedAt: string;
  status: EscalationStatus;
  ncrId: Id | null;
  decisionReason: string | null;
  decidedBy: Id | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewQualityEscalation {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  sourceId: Id;
  sourceReference?: string | null;
  system?: string | null;
  description: string;
  severity?: string | null;
  pointNo?: string | null;
  failingRunNo?: number | null;
  failingActual?: string | null;
  failingRemarks?: string | null;
  requestedBy: Id | null;
}

export function makeEscalation(input: NewQualityEscalation): QualityEscalation {
  if (!input.projectId) throw new Error('validation: an escalation requires the project');
  if (!input.sourceId) throw new Error('validation: an escalation requires the defect it asks about');
  if (!input.description?.trim()) throw new Error('validation: an escalation requires what the defect is');
  if (!input.requestedBy) throw new Error('validation: an escalation requires the person asking');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    sourceType: 'commissioning.punch',
    sourceId: input.sourceId,
    sourceReference: input.sourceReference ?? null,
    system: input.system ?? null,
    description: input.description.trim(),
    severity: input.severity ?? null,
    pointNo: input.pointNo ?? null,
    failingRunNo: input.failingRunNo ?? null,
    failingActual: input.failingActual ?? null,
    failingRemarks: input.failingRemarks ?? null,
    requestedBy: input.requestedBy,
    requestedAt: now,
    status: 'pending',
    ncrId: null,
    decisionReason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refuses a decision that may not be made — before anything, including an NCR, is written. */
export function assertDecidable(e: QualityEscalation, actorId: Id | null): void {
  if (e.status !== 'pending') throw new Error(`only a pending escalation can be decided — this one is ${e.status}`);
  if (!actorId) throw new Error('validation: deciding an escalation requires an authenticated person');
  if (actorId === e.requestedBy) {
    throw new Error('access denied: the person who escalated this defect may not decide it — Quality decides what Testing & Commissioning asks');
  }
}

export function decideNcrRaised(e: QualityEscalation, input: { ncrId: Id; actorId: Id | null }): QualityEscalation {
  assertDecidable(e, input.actorId);
  const now = new Date().toISOString();
  return { ...e, status: 'ncr_raised', ncrId: input.ncrId, decidedBy: input.actorId, decidedAt: now, updatedAt: now };
}

export function decideNotNonconformance(e: QualityEscalation, input: { reason: string | undefined; actorId: Id | null }): QualityEscalation {
  assertDecidable(e, input.actorId);
  if (!input.reason?.trim()) throw new Error('validation: "not a non-conformance" requires a reason');
  const now = new Date().toISOString();
  return { ...e, status: 'not_nonconformance', decisionReason: input.reason.trim(), decidedBy: input.actorId, decidedAt: now, updatedAt: now };
}
