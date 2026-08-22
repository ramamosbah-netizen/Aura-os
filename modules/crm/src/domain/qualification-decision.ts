import { type Id, newId } from '@aura/shared';
import type { LeadQualificationAssessment, LeadQualificationDimensions, LeadStatus } from '@aura/shared';

/**
 * Qualification Decision (audit) — the immutable, append-only record of a HUMAN decision to qualify
 * a lead: someone moved it to `qualified`, at a moment, on the evidence that existed then.
 *
 * Why this must be its own record and not fields on the Lead: a lead's qualification score and
 * verdict are NOT stored — they are pure functions of the qualification dimensions
 * (assessLeadQualification), recomputed on every read. The instant anyone re-rates a dimension, the
 * CURRENT verdict changes. Without a snapshot there is no way to answer "on what evidence, and by
 * whom, was this lead qualified?" — the live state has already moved on. This record freezes that
 * answer: who decided, when, from which status, and the exact evidence at that instant.
 *
 * Scope is deliberately ONLY the qualify transition. The audit proved there is no formal lead
 * transition model and no `disqualified` lifecycle semantics, so we do not invent a symmetric
 * "disqualification decision". The schema is generic enough to generalise to a LeadDecision later,
 * IF the domain ever grows those semantics — but that is not claimed today.
 *
 * Written ONCE, inside the same transaction as the status change; never updated, never deleted
 * (enforced by DB triggers, not just by the absence of an update path).
 */
export interface QualificationEvidenceSnapshot {
  /** The raw 0–100 dimension ratings exactly as they stood at the decision (deep-copied value). */
  dimensions: LeadQualificationDimensions;
  /** The derived verdict at the decision: recommendation, score, confidence, coverage, strengths, gaps. */
  assessment: LeadQualificationAssessment;
}

export interface QualificationDecision {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  leadId: Id;
  /** The authoritative lifecycle transition this decision recorded. `toStatus` is always qualified. */
  fromStatus: LeadStatus;
  toStatus: 'qualified';
  /** The real actor from the request context (never a client-supplied value), and the server clock. */
  qualifiedBy: Id | null;
  qualifiedAt: string;
  /** Self-contained, deep-immutable serialization of the evidence the decision was made on. */
  evidenceSnapshot: QualificationEvidenceSnapshot;
  /** Optional human justification / override note (e.g. qualified despite thin coverage, and why). */
  reason: string | null;
  createdAt: string;
}

export interface MakeQualificationDecisionInput {
  tenantId: Id;
  companyId: Id | null;
  leadId: Id;
  fromStatus: LeadStatus;
  qualifiedBy: Id | null;
  dimensions: LeadQualificationDimensions;
  assessment: LeadQualificationAssessment;
  reason?: string | null;
}

export function makeQualificationDecision(input: MakeQualificationDecisionInput): QualificationDecision {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    leadId: input.leadId,
    fromStatus: input.fromStatus,
    toStatus: 'qualified',
    qualifiedBy: input.qualifiedBy,
    qualifiedAt: now,
    // Deep copy by value: a later reassessment of the lead must never be able to reach in and
    // mutate this frozen evidence. The snapshot IS the record; the live assessment is not.
    evidenceSnapshot: JSON.parse(JSON.stringify({
      dimensions: input.dimensions,
      assessment: input.assessment,
    })) as QualificationEvidenceSnapshot,
    reason: input.reason ?? null,
    createdAt: now,
  };
}

export const QUALIFICATION_DECISION_EVENT = {
  recorded: 'crm.lead.qualification_decided',
} as const;
