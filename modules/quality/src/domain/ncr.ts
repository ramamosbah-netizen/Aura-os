import { randomUUID } from 'node:crypto';

/**
 * Non-Conformance Report (NCR) — the corrective-action loop (QA/QC gap). An NCR walks a controlled
 * state machine rather than a settable status:
 *
 *   raised ─plan→ action_planned ─correct→ corrected ─verify(accept)→ closed
 *                      ▲                                     │
 *                      └──────────verify(reject)─────────────┘   (correction inadequate → re-do)
 *
 * `plan` records the root cause + corrective action + owner; `correct` marks the fix implemented;
 * `verify` is the QA close-out — accept ⇒ closed (immutable), reject ⇒ back to action_planned with
 * an immutable NcrVerification record capturing why. An NCR may be raised standalone or from a
 * failed Inspection Request (`sourceIrId`).
 */
export type NcrStatus = 'raised' | 'action_planned' | 'corrected' | 'closed';

/** Allowed forward transitions. `corrected` can also loop back to action_planned on a failed verify. */
export const NCR_TRANSITIONS: Record<NcrStatus, NcrStatus[]> = {
  raised: ['action_planned'],
  action_planned: ['corrected'],
  corrected: ['closed', 'action_planned'],
  closed: [],
};

export interface Ncr {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  /** The planned corrective action (set at `plan`). */
  correctiveAction: string | null;
  severity: 'minor' | 'major';
  /**
   * The ELV system this non-conformance is against — 'cctv', 'access-control', 'fire-alarm'…
   *
   * Null means "not recorded", not "applies to none". The Project 360 discipline lens treats a row
   * with no system as project-wide and keeps it under every filter, so leaving this null is the
   * honest state for an NCR nobody has attributed yet.
   */
  system: string | null;
  status: NcrStatus;
  raisedBy: string | null;
  assignedTo: string | null;
  /** Provenance: the failed Inspection Request that triggered this NCR (nullable). */
  sourceIrId: string | null;
  sourceIrNumber: string | null;
  actionPlannedAt: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  /**
   * When the correction is due. NULL means UNDATED, which is not the same as "not overdue" — an
   * NCR nobody put a date on cannot be late, and saying it is would invent a fact.
   */
  dueAt: string | null;
  /**
   * That it WAS escalated, recorded rather than derived. A computed "is it late right now"
   * disappears the moment somebody extends the deadline, and an escalation that vanishes when the
   * date moves is not an audit trail.
   */
  escalatedAt: string | null;
  escalatedBy: string | null;
  escalationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewNcr {
  tenantId: string;
  /** When the correction is due. Optional: an undated NCR is a real one. */
  dueAt?: string | null;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  ncrNumber: string;
  description: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  severity: Ncr['severity'];
  system?: string | null;
  status?: Ncr['status'];
  raisedBy?: string | null;
  assignedTo?: string | null;
  sourceIrId?: string | null;
  sourceIrNumber?: string | null;
}

export function makeNcr(input: NewNcr): Ncr {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ncrNumber: input.ncrNumber.trim(),
    description: input.description.trim(),
    rootCause: input.rootCause ?? null,
    correctiveAction: input.correctiveAction ?? null,
    severity: input.severity,
    system: input.system?.trim() || null,
    status: input.status ?? 'raised',
    raisedBy: input.raisedBy ?? null,
    assignedTo: input.assignedTo ?? null,
    sourceIrId: input.sourceIrId ?? null,
    sourceIrNumber: input.sourceIrNumber ?? null,
    actionPlannedAt: null,
    correctedBy: null,
    correctedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    closedAt: null,
    // Undated until somebody says when the correction is due. Not overdue; not on time.
    dueAt: input.dueAt ?? null,
    escalatedAt: null,
    escalatedBy: null,
    escalationReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class NcrTransitionError extends Error {
  constructor(from: NcrStatus, to: NcrStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`an NCR in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'NcrTransitionError';
  }
}

export function canTransitionNcr(from: NcrStatus, to: NcrStatus): boolean {
  return NCR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertNcrTransition(from: NcrStatus, to: NcrStatus): void {
  if (!canTransitionNcr(from, to)) throw new NcrTransitionError(from, to);
}

const touch = (n: Ncr): Ncr => ({ ...n, updatedAt: new Date().toISOString() });

/** raised → action_planned. Records root cause + corrective action + owner (all required). */
export function planNcrAction(
  ncr: Ncr,
  input: { rootCause: string; correctiveAction: string; assignedTo?: string | null },
): Ncr {
  assertNcrTransition(ncr.status, 'action_planned');
  if (!input.rootCause?.trim()) throw new Error('root cause is required to plan corrective action');
  if (!input.correctiveAction?.trim()) throw new Error('a corrective action is required');
  return {
    ...touch(ncr),
    status: 'action_planned',
    rootCause: input.rootCause.trim(),
    correctiveAction: input.correctiveAction.trim(),
    assignedTo: input.assignedTo?.trim() || ncr.assignedTo,
    actionPlannedAt: new Date().toISOString(),
  };
}

/** action_planned → corrected. The owner marks the corrective action implemented. */
export function markNcrCorrected(ncr: Ncr, actorId: string | null): Ncr {
  assertNcrTransition(ncr.status, 'corrected');
  return { ...touch(ncr), status: 'corrected', correctedBy: actorId, correctedAt: new Date().toISOString() };
}

/**
 * IS THIS NCR LATE? A question with three answers, not two.
 *
 * `undated` is its own answer and not a quiet "no": an NCR nobody gave a date to cannot be
 * overdue, and a screen that shows it as on-time is making a claim nobody made. A closed NCR is
 * not overdue either — it is finished, whatever date it finished after.
 */
export function ncrOverdue(ncr: Ncr, now = new Date()): 'overdue' | 'on-time' | 'undated' | 'closed' {
  if (ncr.status === 'closed') return 'closed';
  if (!ncr.dueAt) return 'undated';
  return new Date(ncr.dueAt).getTime() < now.getTime() ? 'overdue' : 'on-time';
}

/**
 * ESCALATE AN OVERDUE CORRECTION.
 *
 * Refused unless it really is overdue, because an escalation raised against something that is not
 * late is noise, and a register full of noise is one nobody reads. Refused on a closed NCR for the
 * same reason. Recorded once — escalating twice says nothing the first did not.
 */
export function escalateNcr(ncr: Ncr, actorId: string | null, reason: string, now = new Date()): Ncr {
  const state = ncrOverdue(ncr, now);
  if (state !== 'overdue') {
    throw new Error(
      state === 'undated'
        ? 'only an NCR with a due date can be overdue \u2014 set when the correction is due before escalating it'
        : `only an overdue NCR can be escalated; this one is ${state}`,
    );
  }
  if (ncr.escalatedAt) throw new Error('conflict: this NCR has already been escalated');
  if (!reason?.trim()) {
    throw new Error('validation: an escalation requires a reason \u2014 the record has to say what it was escalated for');
  }
  return {
    ...touch(ncr),
    escalatedAt: now.toISOString(),
    escalatedBy: actorId,
    escalationReason: reason.trim(),
  };
}

/**
 * verify close-out from `corrected`:
 *  - accepted → closed (immutable)
 *  - rejected → action_planned (correction inadequate; must be re-done)
 */
export function verifyNcr(ncr: Ncr, accepted: boolean, actorId: string | null): Ncr {
  const to: NcrStatus = accepted ? 'closed' : 'action_planned';
  assertNcrTransition(ncr.status, to);
  /**
   * THE VERIFIER IS NOT THE PERSON WHO DID THE REPAIR.
   *
   * "Independent verifier accepts/rejects" is the whole point of the step, and nothing enforced
   * it: one account could raise a non-conformance, mark it corrected and close it, and the record
   * would read as though three people had been involved.
   *
   * Independent OF THE CORRECTION, deliberately — not of the raiser. The QA/QC engineer who
   * raised an NCR is normally the right person to verify the fix, and barring them would push the
   * sign-off onto somebody with less reason to look. What cannot happen is the person who did the
   * work signing it off.
   */
  if (actorId && ncr.correctedBy && actorId === ncr.correctedBy) {
    throw new Error('the person who corrected this NCR may not verify it \u2014 somebody signing off their own repair is not verification');
  }
  const now = new Date().toISOString();
  return {
    ...touch(ncr),
    status: to,
    verifiedBy: actorId,
    verifiedAt: now,
    closedAt: accepted ? now : ncr.closedAt,
  };
}
