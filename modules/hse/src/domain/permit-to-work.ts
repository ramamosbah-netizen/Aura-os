import { randomUUID } from 'node:crypto';

/**
 * Permit To Work (PTW) — the control that authorises a high-risk activity to start, and the one
 * HSE record whose correctness is a safety matter rather than a reporting one. It walks a
 * controlled lifecycle:
 *
 *   draft ─request→ requested ─approve→ approved ─close→ closed
 *      ▲                │                   │
 *      │                │                   └─expire→ expired
 *      └── reject(reason) ┘                            ▲
 *                         └────────── expire ──────────┘
 *
 * Three rules make this a permit system rather than a status field. They live in the service
 * (`approvePermit`) because two of them need other aggregates:
 *
 *   1. A permit cannot be approved without an **approved risk assessment** — you may not authorise
 *      work whose hazards have not been assessed and signed off.
 *   2. The approver may not be the requester (**segregation of duties**) — self-authorisation is
 *      the single most common way a paper permit system fails an audit.
 *   3. A permit outside its validity window cannot be approved — an expired window means the
 *      conditions it was assessed against no longer hold.
 *
 * `closed` and `expired` are terminal: a permit is never re-opened, a new one is raised. That is
 * deliberate — the permit is the audit record of *one* authorisation.
 */
export type PermitStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'closed' | 'expired';

/** Allowed forward transitions. `rejected` returns to `draft`; `closed`/`expired` are terminal. */
export const PERMIT_TRANSITIONS: Record<PermitStatus, PermitStatus[]> = {
  draft: ['requested'],
  requested: ['approved', 'rejected', 'expired'],
  approved: ['closed', 'expired'],
  rejected: ['draft'],
  closed: [],
  expired: [],
};

export interface PermitToWork {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  permitType: 'hot_work' | 'confined_space' | 'height_work' | 'electrical' | 'excavation';
  validFrom: string; // ISO String
  validTo: string; // ISO String
  description: string;
  status: PermitStatus;
  /** The risk assessment authorising this work. Approval is refused without an approved one. */
  riskAssessmentId: string | null;
  /** Who asked for the permit — held separately from createdBy so segregation of duties is checkable. */
  requestedBy: string | null;
  requestedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Why an approver refused it; mandatory on reject so the requester can correct and resubmit. */
  rejectionReason: string | null;
  /** Who closed the permit when the work finished + the area was made safe, and when. */
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPermitToWork {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  permitType: PermitToWork['permitType'];
  validFrom: string;
  validTo: string;
  description: string;
  riskAssessmentId?: string | null;
  status?: PermitToWork['status'];
  createdBy?: string | null;
}

export function makePermitToWork(input: NewPermitToWork): PermitToWork {
  const now = new Date().toISOString();
  const status = input.status ?? 'requested';
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    permitType: input.permitType,
    validFrom: input.validFrom,
    validTo: input.validTo,
    description: input.description.trim(),
    status,
    riskAssessmentId: input.riskAssessmentId ?? null,
    // A permit that starts life already requested was requested by whoever raised it.
    requestedBy: status === 'requested' ? input.createdBy ?? null : null,
    requestedAt: status === 'requested' ? now : null,
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    closedBy: null,
    closedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class PermitTransitionError extends Error {
  constructor(from: PermitStatus, to: PermitStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`a permit in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'PermitTransitionError';
  }
}

export function canTransitionPermit(from: PermitStatus, to: PermitStatus): boolean {
  return PERMIT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPermitTransition(from: PermitStatus, to: PermitStatus): void {
  if (!canTransitionPermit(from, to)) throw new PermitTransitionError(from, to);
}

/** Is `at` inside the permit's authorised window? Approval and closure both depend on it. */
export function isWithinValidity(p: PermitToWork, at: Date = new Date()): boolean {
  const t = at.getTime();
  const from = Date.parse(p.validFrom);
  const to = Date.parse(p.validTo);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return t >= from && t <= to;
}

const touch = (p: PermitToWork): PermitToWork => ({ ...p, updatedAt: new Date().toISOString() });

/** draft → requested. */
export function requestPermitTransition(p: PermitToWork, actorId: string | null): PermitToWork {
  assertPermitTransition(p.status, 'requested');
  return { ...touch(p), status: 'requested', requestedBy: actorId, requestedAt: new Date().toISOString() };
}

/**
 * requested → approved. The risk-assessment and segregation-of-duties gates are enforced in the
 * service, which can read the other aggregate; this keeps the pure transition honest about what
 * it does and does not check.
 */
export function approvePermitTransition(p: PermitToWork, actorId: string | null): PermitToWork {
  assertPermitTransition(p.status, 'approved');
  return { ...touch(p), status: 'approved', approvedBy: actorId, approvedAt: new Date().toISOString() };
}

/** requested → rejected (reason mandatory — the requester has to know what to fix). */
export function rejectPermitTransition(p: PermitToWork, actorId: string | null, reason: string): PermitToWork {
  if (!reason?.trim()) throw new Error('a rejection reason is required');
  assertPermitTransition(p.status, 'rejected');
  return { ...touch(p), status: 'rejected', approvedBy: actorId, rejectionReason: reason.trim() };
}

/** rejected → draft (re-open to correct and re-request). */
export function reopenPermitTransition(p: PermitToWork): PermitToWork {
  assertPermitTransition(p.status, 'draft');
  return { ...touch(p), status: 'draft', rejectionReason: null };
}

/** approved → closed: the work finished and the area was made safe. */
export function closePermitTransition(p: PermitToWork, actorId: string | null): PermitToWork {
  assertPermitTransition(p.status, 'closed');
  return { ...touch(p), status: 'closed', closedBy: actorId, closedAt: new Date().toISOString() };
}

/**
 * requested|approved → expired. A permit whose window has passed stops authorising work whether or
 * not anyone remembered to close it — an open permit past its validity is the liability this
 * transition exists to retire.
 */
export function expirePermitTransition(p: PermitToWork): PermitToWork {
  assertPermitTransition(p.status, 'expired');
  return { ...touch(p), status: 'expired' };
}
