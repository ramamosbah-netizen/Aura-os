import { type Id, newId } from '@aura/shared';

// ── Delay Analysis & Extension of Time (EOT) Claims ────────────────────────
// Tracks individual delay events and bundles them into formal EOT claim
// submissions to the employer for contract time extensions.

export type DelayCause = 'employer' | 'contractor' | 'neutral' | 'force_majeure';
export type DelayStatus = 'identified' | 'analysed' | 'submitted' | 'approved' | 'rejected';
export type EotStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'partially_approved' | 'rejected';

export interface DelayEvent {
  id: Id;
  tenantId: Id;
  projectId: Id;
  title: string;
  causeCategory: DelayCause;
  startDate: string;       // ISO date
  endDate: string | null;
  delayDays: number;
  isConcurrent: boolean;
  /**
   * A WBS code as TEXT, kept exactly as it was and no longer the link that matters.
   *
   * It drifts the first time somebody renumbers a package and no query can follow it, which is not
   * a basis for a contractual instrument. `affectedTaskIds` below is the canonical one; this reads
   * as what it always was — a note (migration 0325).
   */
  linkedActivityCode: string | null;
  /**
   * The activities this delay actually hit, canonically. Many, because a storm stops three
   * activities rather than a code.
   */
  affectedTaskIds: Id[];
  description: string | null;
  status: DelayStatus;
  /**
   * What a named person concluded, on a date, against the plan as it then stood.
   *
   * KEPT BESIDE THE DERIVED IMPACT, never instead of it. The impact of a delay is computed from the
   * network on every read and changes as the programme changes — which is correct, and is why it is
   * not stored. But a figure submitted to an employer was made at a moment, and must survive the
   * plan moving underneath it. Storing only the derived number would rewrite history on every plan
   * edit; storing only this one would hide that the plan has moved. Both, exactly as PLN-12 keeps a
   * measurement beside the figure stated against it.
   */
  assessedAt: string | null;
  assessedBy: Id | null;
  /** Working days of completion lost, as assessed. Zero is a real answer — absorbed by float. */
  assessedImpactWorkingDays: number | null;
  assessmentNote: string | null;
  createdAt: string;
}

export interface NewDelayEvent {
  tenantId: Id;
  projectId: Id;
  title: string;
  causeCategory?: DelayCause;
  startDate: string;
  endDate?: string | null;
  delayDays?: number;
  isConcurrent?: boolean;
  linkedActivityCode?: string | null;
  affectedTaskIds?: Id[];
  description?: string | null;
}

export function makeDelayEvent(input: NewDelayEvent): DelayEvent {
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: input.title.trim(),
    causeCategory: input.causeCategory ?? 'employer',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    delayDays: Number.isFinite(input.delayDays) ? Number(input.delayDays) : 0,
    isConcurrent: input.isConcurrent ?? false,
    linkedActivityCode: input.linkedActivityCode ?? null,
    affectedTaskIds: [...new Set(input.affectedTaskIds ?? [])],
    description: input.description ?? null,
    status: 'identified',
    assessedAt: null,
    assessedBy: null,
    assessedImpactWorkingDays: null,
    assessmentNote: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Record what a named person concluded about a delay's impact.
 *
 * REFUSES rather than repairs. An assessment is a whole fact — a figure, a name and a moment — and
 * a figure with nobody behind it is not one. Zero is accepted and is the commonest honest answer
 * to an EOT claim: the delay happened and the completion date did not move.
 *
 * The derived impact is deliberately NOT what is stored. This is the number that was submitted,
 * against the plan as it stood; the plan will move, and the two are then shown side by side.
 */
export function assessDelay(
  delay: DelayEvent,
  input: { impactWorkingDays: number; note?: string | null; actorId?: Id | null },
): DelayEvent {
  if (!input.actorId) throw new Error('an assessment must be recorded against a named assessor');
  const days = Number(input.impactWorkingDays);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('assessed impact must be a number of working days, and cannot be negative');
  }
  return {
    ...delay,
    assessedAt: new Date().toISOString(),
    assessedBy: input.actorId,
    assessedImpactWorkingDays: days,
    assessmentNote: input.note?.trim() || null,
    // `analysed` is the state this field has always implied and nothing ever set.
    status: delay.status === 'identified' ? 'analysed' : delay.status,
  };
}

export interface EotClaim {
  id: Id;
  tenantId: Id;
  projectId: Id;
  claimNumber: number;
  title: string;
  submittedDays: number;
  approvedDays: number;
  status: EotStatus;
  justification: string | null;
  originalCompletionDate: string | null;
  revisedCompletionDate: string | null;
  /**
   * WHO WROTE IT AND WHO SENT IT. The table had `submitted_at` with nobody beside it and no author
   * column at all — an extension-of-time claim is a formal contractual position that moves the
   * completion date and carries money with it, and it was written by nobody and submitted by nobody.
   */
  createdBy: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** IDs of linked delay events backing this claim. */
  delayEventIds: Id[];
  createdAt: string;
}

export interface NewEotClaim {
  tenantId: Id;
  projectId: Id;
  claimNumber: number;
  title: string;
  submittedDays: number;
  justification?: string | null;
  originalCompletionDate?: string | null;
  delayEventIds?: Id[];
  createdBy?: string | null;
}

export function makeEotClaim(input: NewEotClaim): EotClaim {
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    claimNumber: input.claimNumber,
    title: input.title.trim(),
    submittedDays: input.submittedDays,
    approvedDays: 0,
    status: 'draft',
    justification: input.justification ?? null,
    originalCompletionDate: input.originalCompletionDate ?? null,
    revisedCompletionDate: null,
    createdBy: input.createdBy ?? null,
    submittedAt: null,
    submittedBy: null,
    decidedAt: null,
    decidedBy: null,
    delayEventIds: input.delayEventIds ?? [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * draft → submitted. The claim goes OUT to the client, and the record says who sent it.
 */
export function submitEotClaim(claim: EotClaim, actorId: string | null): EotClaim {
  if (claim.status !== 'draft') throw new Error(`EOT claim ${claim.claimNumber} is not in draft status`);
  return { ...claim, status: 'submitted', submittedAt: new Date().toISOString(), submittedBy: actorId };
}

/**
 * submitted → approved | partially_approved | rejected. Recording the determination that came back.
 *
 * TWO RULES, AND NEITHER IS AN INVENTION.
 *
 * A determination answers a claim that was SENT: deciding a draft would mean answering something
 * the client never received, and the status graph already says a claim must be submitted first —
 * this makes the service honour it rather than assume it.
 *
 * And THE PERSON WHO SUBMITTED THE CLAIM DOES NOT DETERMINE IT. A claim out and a determination
 * back are the two halves of an exchange; one account doing both is a self-assessment with a status
 * field on it. Measured before this, as one Commercial/QS principal holding `projects.eot-claim.*`:
 * submit returned success and decide returned success on the same claim.
 */
export function decideEotClaim(
  claim: EotClaim,
  decision: { status: 'approved' | 'partially_approved' | 'rejected'; approvedDays: number; revisedCompletionDate?: string | null },
  actorId: string | null,
): EotClaim {
  if (claim.status !== 'submitted' && claim.status !== 'under_review') {
    // "can only" → 409 CONFLICT in the API error taxonomy.
    throw new Error(`an EOT claim can only be determined once it has been submitted (this one is ${claim.status})`);
  }
  if (actorId && claim.submittedBy && actorId === claim.submittedBy) {
    throw new Error('the person who submitted this EOT claim may not determine it — a claim out and a determination back are two sides of one exchange');
  }
  return {
    ...claim,
    status: decision.status,
    approvedDays: decision.approvedDays,
    decidedAt: new Date().toISOString(),
    decidedBy: actorId,
    revisedCompletionDate: decision.revisedCompletionDate ?? claim.revisedCompletionDate,
  };
}

/**
 * Whether the claim and its determination came from two different people. Same reporting contract
 * as the document revision, the daily report and the handover: `null` means undetermined, so there
 * is nothing to judge; `unverifiable` means determined before `submittedBy` existed.
 */
export function eotSeparation(claim: EotClaim): 'enforced' | 'unverifiable' | null {
  if (!claim.decidedBy) return null;
  return claim.submittedBy ? 'enforced' : 'unverifiable';
}

/** Aggregate delay analysis metrics for a project. */
export interface DelayAnalysisSummary {
  totalDelayEvents: number;
  totalDelayDays: number;
  netDelayDays: number;        // non-concurrent only
  employerDays: number;
  contractorDays: number;
  neutralDays: number;
  forceMajeureDays: number;
  totalEotClaimed: number;
  totalEotApproved: number;
  pendingEotDays: number;
}

export function calculateDelayAnalysis(
  delays: DelayEvent[],
  eotClaims: EotClaim[],
): DelayAnalysisSummary {
  let totalDays = 0;
  let netDays = 0;
  let employer = 0;
  let contractor = 0;
  let neutral = 0;
  let fm = 0;

  for (const d of delays) {
    totalDays += d.delayDays;
    if (!d.isConcurrent) netDays += d.delayDays;
    switch (d.causeCategory) {
      case 'employer': employer += d.delayDays; break;
      case 'contractor': contractor += d.delayDays; break;
      case 'neutral': neutral += d.delayDays; break;
      case 'force_majeure': fm += d.delayDays; break;
    }
  }

  let totalClaimed = 0;
  let totalApproved = 0;
  for (const c of eotClaims) {
    totalClaimed += c.submittedDays;
    totalApproved += c.approvedDays;
  }

  return {
    totalDelayEvents: delays.length,
    totalDelayDays: totalDays,
    netDelayDays: netDays,
    employerDays: employer,
    contractorDays: contractor,
    neutralDays: neutral,
    forceMajeureDays: fm,
    totalEotClaimed: totalClaimed,
    totalEotApproved: totalApproved,
    pendingEotDays: totalClaimed - totalApproved,
  };
}
