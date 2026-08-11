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
  createdAt: string;
  updatedAt: string;
}

export interface NewNcr {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  ncrNumber: string;
  description: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  severity: Ncr['severity'];
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
 * verify close-out from `corrected`:
 *  - accepted → closed (immutable)
 *  - rejected → action_planned (correction inadequate; must be re-done)
 */
export function verifyNcr(ncr: Ncr, accepted: boolean, actorId: string | null): Ncr {
  const to: NcrStatus = accepted ? 'closed' : 'action_planned';
  assertNcrTransition(ncr.status, to);
  const now = new Date().toISOString();
  return {
    ...touch(ncr),
    status: to,
    verifiedBy: actorId,
    verifiedAt: now,
    closedAt: accepted ? now : ncr.closedAt,
  };
}
