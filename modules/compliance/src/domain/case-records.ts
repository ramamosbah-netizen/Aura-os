import { type Id, newId, classifyExpiry, daysUntil, type ExpiryStatus } from '@aura/shared';

/**
 * The three records that hang off a compliance case: submissions, inspections and decisions —
 * plus the certificate a successful case produces (ADR-0018 §7–§9).
 *
 * All four are **append-only**. A case that was rejected and resubmitted has two submissions and
 * two decisions, and both survive: the first refusal and its reason are the record a dispute turns
 * on, and a `status` field on the case would have erased it the moment approval arrived.
 */

// ── Submission ─────────────────────────────────────────────────────────────────────────────────

export interface ComplianceSubmission {
  id: Id;
  tenantId: Id;
  caseId: Id;
  /** 1-based; a resubmission is attempt 2, not an edit of attempt 1. */
  attempt: number;
  submittedAt: string;
  submittedBy: Id | null;
  /** The authority's own reference for this submission, once it issues one. */
  reference: string | null;
  fee: number | null;
  currency: string | null;
  notes: string | null;
}

export interface NewComplianceSubmission {
  tenantId: Id;
  caseId: Id;
  attempt: number;
  submittedAt: string;
  submittedBy?: Id | null;
  reference?: string | null;
  fee?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export function makeSubmission(input: NewComplianceSubmission): ComplianceSubmission {
  if (!input.caseId) throw new Error('caseId is required');
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error('attempt must be a positive integer');
  if (input.fee !== null && input.fee !== undefined && input.fee < 0) throw new Error('fee cannot be negative');
  return {
    id: newId(),
    tenantId: input.tenantId,
    caseId: input.caseId,
    attempt: input.attempt,
    submittedAt: input.submittedAt,
    submittedBy: input.submittedBy ?? null,
    reference: (input.reference ?? '').trim() || null,
    fee: input.fee ?? null,
    currency: (input.currency ?? '').trim().toUpperCase() || null,
    notes: (input.notes ?? '').trim() || null,
  };
}

// ── Inspection (OPTIONAL — ADR-0018 §8) ────────────────────────────────────────────────────────

export const INSPECTION_OUTCOMES = ['pass', 'conditional', 'fail'] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

/**
 * An authority visiting us. Distinct from `quality.InspectionRequest`, which is us inspecting our
 * own workmanship — different actor, different outcome vocabulary, legal rather than contractual
 * consequence.
 */
export interface ComplianceInspection {
  id: Id;
  tenantId: Id;
  caseId: Id;
  requestedAt: string | null;
  scheduledAt: string | null;
  conductedAt: string | null;
  /** The authority's inspector and their reference for the visit. */
  inspectorReference: string | null;
  inspectionReference: string | null;
  outcome: InspectionOutcome | null;
  notes: string | null;
  reinspectionRequired: boolean;
  reinspectionDate: string | null;
}

export interface NewComplianceInspection {
  tenantId: Id;
  caseId: Id;
  requestedAt?: string | null;
  scheduledAt?: string | null;
}

export function makeInspection(input: NewComplianceInspection): ComplianceInspection {
  if (!input.caseId) throw new Error('caseId is required');
  return {
    id: newId(),
    tenantId: input.tenantId,
    caseId: input.caseId,
    requestedAt: input.requestedAt ?? null,
    scheduledAt: input.scheduledAt ?? null,
    conductedAt: null,
    inspectorReference: null,
    inspectionReference: null,
    outcome: null,
    notes: null,
    reinspectionRequired: false,
    reinspectionDate: null,
  };
}

/** Record the visit's result. A `fail` or `conditional` implies re-inspection unless stated otherwise. */
export function recordInspectionOutcome(
  i: ComplianceInspection,
  outcome: InspectionOutcome,
  on: string,
  extras: { notes?: string | null; inspectorReference?: string | null; inspectionReference?: string | null; reinspectionDate?: string | null } = {},
): ComplianceInspection {
  if (i.outcome) throw new Error('inspection outcome is already recorded');
  return {
    ...i,
    conductedAt: on,
    outcome,
    notes: (extras.notes ?? '').trim() || null,
    inspectorReference: (extras.inspectorReference ?? '').trim() || null,
    inspectionReference: (extras.inspectionReference ?? '').trim() || null,
    reinspectionRequired: outcome !== 'pass',
    reinspectionDate: extras.reinspectionDate ?? null,
  };
}

// ── Decision (append-only — ADR-0018 §7) ───────────────────────────────────────────────────────

export const DECISION_OUTCOMES = ['approved', 'approved_with_conditions', 'rejected'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export interface ComplianceDecision {
  id: Id;
  tenantId: Id;
  caseId: Id;
  /** Which submission this decides. A case with two attempts has two decisions. */
  submissionId: Id | null;
  outcome: DecisionOutcome;
  decisionDate: string;
  decisionBy: string | null;
  reference: string | null;
  /** Set when the outcome is conditional — what must be done for it to stand. */
  conditions: string | null;
  /** Set when rejected — why. Without it a refusal cannot be acted on. */
  reason: string | null;
}

export interface NewComplianceDecision {
  tenantId: Id;
  caseId: Id;
  submissionId?: Id | null;
  outcome: DecisionOutcome;
  decisionDate: string;
  decisionBy?: string | null;
  reference?: string | null;
  conditions?: string | null;
  reason?: string | null;
}

export function makeDecision(input: NewComplianceDecision): ComplianceDecision {
  if (!input.caseId) throw new Error('caseId is required');
  if (!DECISION_OUTCOMES.includes(input.outcome)) throw new Error(`unknown outcome ${String(input.outcome)}`);
  const reason = (input.reason ?? '').trim() || null;
  const conditions = (input.conditions ?? '').trim() || null;
  // A refusal with no reason cannot be acted on, and an unattributed one is not a control.
  if (input.outcome === 'rejected' && !reason) throw new Error('a rejected decision requires a reason');
  if (input.outcome === 'approved_with_conditions' && !conditions) {
    throw new Error('an approved_with_conditions decision requires its conditions');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    caseId: input.caseId,
    submissionId: input.submissionId ?? null,
    outcome: input.outcome,
    decisionDate: input.decisionDate,
    decisionBy: (input.decisionBy ?? '').trim() || null,
    reference: (input.reference ?? '').trim() || null,
    conditions,
    reason,
  };
}

// ── Certificate (append-only series — ADR-0018 §9) ─────────────────────────────────────────────

export interface ComplianceCertificate {
  id: Id;
  tenantId: Id;
  caseId: Id;
  number: string;
  issuedAt: string;
  expiresAt: string | null;
  /** Set when a later certificate replaces this one — the renewal chain, not an edit. */
  supersededByCertificateId: Id | null;
  notes: string | null;
}

export interface NewComplianceCertificate {
  tenantId: Id;
  caseId: Id;
  number: string;
  issuedAt: string;
  expiresAt?: string | null;
  notes?: string | null;
}

export function makeCertificate(input: NewComplianceCertificate): ComplianceCertificate {
  if (!input.caseId) throw new Error('caseId is required');
  if (!(input.number ?? '').trim()) throw new Error('certificate number is required');
  if (input.expiresAt && input.expiresAt < input.issuedAt) {
    throw new Error('certificate cannot expire before it is issued');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    caseId: input.caseId,
    number: input.number.trim(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt ?? null,
    supersededByCertificateId: null,
    notes: (input.notes ?? '').trim() || null,
  };
}

/**
 * Renew by **issuing a new certificate** and pointing the old one at it. Never by editing an
 * expiry date: "what was valid on 14 March" is a legal question, and mutating the row destroys
 * the only answer.
 */
export function renew(
  previous: ComplianceCertificate,
  next: NewComplianceCertificate,
): { previous: ComplianceCertificate; current: ComplianceCertificate } {
  if (previous.supersededByCertificateId) throw new Error(`certificate ${previous.number} is already superseded`);
  const current = makeCertificate(next);
  return { previous: { ...previous, supersededByCertificateId: current.id }, current };
}

/** The live certificate in a series — the one nothing supersedes. */
export function currentCertificate(series: ComplianceCertificate[]): ComplianceCertificate | null {
  return series.find((c) => !c.supersededByCertificateId) ?? null;
}

/**
 * Validity as of a date. A certificate with no expiry never lapses (some approvals are perpetual);
 * anything else uses the shared expiry projection rather than a fifth private copy of it.
 */
export function certificateStatus(
  c: ComplianceCertificate,
  asOf: string,
  withinDays = 90,
): { status: ExpiryStatus; daysToExpiry: number | null } {
  if (!c.expiresAt) return { status: 'valid', daysToExpiry: null };
  const days = daysUntil(c.expiresAt, asOf);
  return { status: classifyExpiry(days, withinDays), daysToExpiry: days };
}
