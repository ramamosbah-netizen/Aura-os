import { randomUUID } from 'node:crypto';

export interface Snag {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * open → resolved → closed, AND NO WAY BACK.
 *
 * There was no state machine here at all. `status` was a plain field and the service assigned to it
 * in place — `snag.status = status` — with no transition function anywhere in the domain. Measured
 * against the running API:
 *
 *   200 PUT quality/snags/:id/close    status=closed    resolvedAt=null
 *   200 PUT quality/snags/:id/resolve  status=resolved            <- WENT BACKWARDS
 *
 * A closed defect walked back to 'resolved' and nothing objected. Closing also recorded no actor and
 * no timestamp, and did not even set `resolved_at` on the way past.
 *
 * NOTE WHAT IS DELIBERATELY ABSENT: there is no rule that the person who RAISED a snag may not close
 * it. On a site the inspector who found the defect is the right person to verify the fix, and
 * inventing a separation here would block the normal practice rather than control it. What was
 * broken was that the record could not say WHO closed it or WHEN, and that it could go backwards.
 */
export const SNAG_TRANSITIONS: Record<Snag['status'], Snag['status'][]> = {
  open: ['resolved'],
  resolved: ['closed', 'open'], // reopened when the fix does not stand up to inspection
  closed: [],
};

export class SnagTransitionError extends Error {
  constructor(from: Snag['status'], to: Snag['status']) {
    // "can only" → 409 CONFLICT via the API error taxonomy.
    super(`a snag in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'SnagTransitionError';
  }
}

export function assertSnagTransition(from: Snag['status'], to: Snag['status']): void {
  if (!(SNAG_TRANSITIONS[from]?.includes(to) ?? false)) throw new SnagTransitionError(from, to);
}

/** open → resolved. The fix is claimed; it is not yet accepted. */
export function resolveSnag(snag: Snag, actorId: string | null): Snag {
  assertSnagTransition(snag.status, 'resolved');
  const now = new Date().toISOString();
  return { ...snag, status: 'resolved', resolvedBy: actorId, resolvedAt: now, updatedAt: now };
}

/** resolved → closed. The fix was inspected and accepted. Immutable thereafter. */
export function closeSnag(snag: Snag, actorId: string | null): Snag {
  assertSnagTransition(snag.status, 'closed');
  const now = new Date().toISOString();
  return { ...snag, status: 'closed', closedBy: actorId, closedAt: now, updatedAt: now };
}

/** resolved → open. The claimed fix did not stand up; the defect is live again. */
export function reopenSnag(snag: Snag, reason: string): Snag {
  if (!reason?.trim()) throw new Error('a reason is required to reopen a snag — the fix was claimed and rejected, and the record must say why');
  assertSnagTransition(snag.status, 'open');
  const now = new Date().toISOString();
  return { ...snag, status: 'open', resolvedBy: null, resolvedAt: null, updatedAt: now };
}

export interface NewSnag {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  description: string;
  locationDetail: string;
  severity: Snag['severity'];
  status?: Snag['status'];
  assignedTo?: string | null;
  createdBy?: string | null;
}

export function makeSnag(input: NewSnag): Snag {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    description: input.description.trim(),
    locationDetail: input.locationDetail.trim(),
    severity: input.severity,
    status: input.status ?? 'open',
    assignedTo: input.assignedTo ?? null,
    resolvedBy: null,
    resolvedAt: null,
    closedBy: null,
    closedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
