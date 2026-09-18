import { randomUUID } from 'node:crypto';

/**
 * Document Revision (G-33) — the governed, immutable unit of the Document Control lifecycle. The
 * register entry is the document HEADER (number, title, current revision, distribution); each
 * REVISION of it walks a controlled approval state machine and is preserved forever:
 *
 *   draft ─submit→ submitted ─start_review→ under_review ─┬─approve→ approved ─issue→ issued ─(next issue)→ superseded
 *                                                          └─reject(reason)→ rejected ──createRevision──┐
 *   rejected / issued ─createRevision→ (new revision @ draft; the source stays IMMUTABLE)              ┘
 *
 * Once ISSUED a revision is immutable — the only forward move is a NEW revision. A rejection MUST
 * carry a reason. Approval/rejection/issue metadata (actor + timestamp + comments) is stamped on
 * the revision, so the approval journey is auditable from the revision itself, not reconstructed.
 */
export type DocumentRevisionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'issued'
  | 'superseded';

/** Allowed forward transitions. Terminal states (rejected/issued/superseded) escape only via a new revision. */
export const DOCUMENT_TRANSITIONS: Record<DocumentRevisionStatus, DocumentRevisionStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['issued'],
  issued: ['superseded'],
  rejected: [],
  superseded: [],
};

/** A revision may spawn the next revision once it has been rejected or issued (never mid-review). */
export const REVISABLE_STATUSES: readonly DocumentRevisionStatus[] = ['rejected', 'issued', 'superseded'];

export interface DocumentRevision {
  id: string;
  tenantId: string;
  companyId: string | null;
  registerEntryId: string;
  documentNumber: string;
  projectId: string;
  revision: string;
  status: DocumentRevisionStatus;
  /** the revision this one supersedes (null for the first). */
  previousRevision: string | null;
  reasonForRevision: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** approval comment or the MANDATORY rejection reason. */
  decisionComments: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDocumentRevision {
  tenantId: string;
  companyId?: string | null;
  registerEntryId: string;
  documentNumber: string;
  projectId: string;
  revision?: string;
  status?: DocumentRevisionStatus;
  previousRevision?: string | null;
  reasonForRevision?: string | null;
  createdBy?: string | null;
}

export function makeDocumentRevision(input: NewDocumentRevision): DocumentRevision {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    registerEntryId: input.registerEntryId,
    documentNumber: input.documentNumber.trim(),
    projectId: input.projectId,
    revision: (input.revision ?? 'A').trim(),
    status: input.status ?? 'draft',
    previousRevision: input.previousRevision ?? null,
    reasonForRevision: input.reasonForRevision ?? null,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    decidedBy: null,
    decidedAt: null,
    decisionComments: null,
    issuedBy: null,
    issuedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class DocumentTransitionError extends Error {
  constructor(from: DocumentRevisionStatus, to: DocumentRevisionStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`a document revision in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'DocumentTransitionError';
  }
}

export function canTransitionDocument(from: DocumentRevisionStatus, to: DocumentRevisionStatus): boolean {
  return DOCUMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertDocumentTransition(from: DocumentRevisionStatus, to: DocumentRevisionStatus): void {
  if (!canTransitionDocument(from, to)) throw new DocumentTransitionError(from, to);
}

/** Next revision label: alpha `A`→`B` (register default), numeric `00`→`01` (zero-pad kept), else suffix. */
export function nextRevision(current: string): string {
  const c = current.trim();
  if (/^[A-Za-z]$/.test(c)) return String.fromCharCode(c.charCodeAt(0) + 1);
  if (/^\d+$/.test(c)) return String(Number(c) + 1).padStart(c.length, '0');
  return `${c}.1`;
}

const touch = (d: DocumentRevision): DocumentRevision => ({ ...d, updatedAt: new Date().toISOString() });

/** draft → submitted. */
export function submitDocument(d: DocumentRevision, actorId: string | null): DocumentRevision {
  assertDocumentTransition(d.status, 'submitted');
  return { ...touch(d), status: 'submitted', submittedBy: actorId, submittedAt: new Date().toISOString() };
}

/** submitted → under_review. */
export function startReviewDocument(d: DocumentRevision, reviewerId: string | null): DocumentRevision {
  assertDocumentTransition(d.status, 'under_review');
  return { ...touch(d), status: 'under_review', reviewedBy: reviewerId, reviewedAt: new Date().toISOString() };
}

/**
 * under_review → approved.
 *
 * TWO RULES, and neither invents a stage that was not already there.
 *
 * THE AUTHOR MAY NOT APPROVE THEIR OWN REVISION. Measured before this existed: one principal
 * submitted, reviewed, approved and issued the same drawing, with `submittedBy = decidedBy =
 * issuedBy`. Nothing refused any step.
 *
 * APPROVAL NEVER FABRICATES `reviewedBy`. This used to read `reviewedBy: actorId ?? d.reviewedBy`,
 * so where review had left no name the APPROVER silently became the reviewer and the record then
 * claimed a review that nobody performed. The state machine already forces
 * `submitted → under_review → approved` with no shortcut, so review is a formal stage and not
 * decoration — what was missing is that the stage had to leave a name behind. It does now: an
 * approval is refused until it has, rather than filling the gap with the approver.
 */
export function approveDocument(d: DocumentRevision, actorId: string | null, comments?: string): DocumentRevision {
  assertDocumentTransition(d.status, 'approved');
  if (!d.reviewedBy) {
    throw new Error(
      'this revision cannot be approved until its review records who performed it — an approval must not stand in for a review that left no name',
    );
  }
  if (actorId && d.submittedBy && actorId === d.submittedBy) {
    throw new Error('the person who submitted this revision may not approve their own — a second pair of eyes is what review means');
  }
  const now = new Date().toISOString();
  return { ...touch(d), status: 'approved', decidedBy: actorId, decidedAt: now, decisionComments: comments?.trim() || null };
}

/** under_review → rejected. The reason is MANDATORY. */
export function rejectDocument(d: DocumentRevision, actorId: string | null, reason: string): DocumentRevision {
  if (!reason?.trim()) throw new Error('a rejection reason is required');
  assertDocumentTransition(d.status, 'rejected');
  if (actorId && d.submittedBy && actorId === d.submittedBy) {
    throw new Error('the person who submitted this revision may not reject their own — withdrawing it is a revision, not a decision');
  }
  const now = new Date().toISOString();
  // `reviewedBy` is NOT back-filled here either: a rejection records who DECIDED, and who reviewed
  // is whatever the review stage recorded.
  return { ...touch(d), status: 'rejected', decidedBy: actorId, decidedAt: now, decisionComments: reason.trim() };
}

/**
 * approved → issued. Immutable thereafter — a later revision SUPERSEDES it; nothing overwrites it.
 *
 * APPROVE IS NOT ISSUE. Approving a revision is an internal technical judgement; issuing it releases
 * the document outside the business, and one permission must never do both by accident. The role
 * split makes that organisational — the Technical Manager approves and does not hold
 * `doccontrol.revision.issue`, the Document Controller issues and approves nothing — and this rule
 * is what holds when one person carries both roles, which no permission can see.
 */
export function issueDocument(d: DocumentRevision, actorId: string | null): DocumentRevision {
  assertDocumentTransition(d.status, 'issued');
  if (actorId && d.decidedBy && actorId === d.decidedBy) {
    throw new Error(
      'the person who approved this revision may not issue it — approving it internally and releasing it outside are two acts',
    );
  }
  return { ...touch(d), status: 'issued', issuedBy: actorId, issuedAt: new Date().toISOString() };
}

/** Whether each separation could actually be CHECKED on this revision. Derived, never stored twice. */
export function revisionSeparation(d: DocumentRevision): {
  authorVsApprover: 'enforced' | 'unverifiable' | null;
  approverVsIssuer: 'enforced' | 'unverifiable' | null;
} {
  return {
    authorVsApprover: d.decidedBy === null ? null : d.submittedBy ? 'enforced' : 'unverifiable',
    approverVsIssuer: d.issuedBy === null ? null : d.decidedBy ? 'enforced' : 'unverifiable',
  };
}

/** issued → superseded (when a later revision is issued). */
export function supersedeDocument(d: DocumentRevision): DocumentRevision {
  assertDocumentTransition(d.status, 'superseded');
  return { ...touch(d), status: 'superseded' };
}

/**
 * Raise the next revision of a rejected/issued revision. Returns the NEW draft revision (the source
 * is NOT mutated — issued revisions stay immutable; a rejected one is kept for the audit trail).
 */
export function createNextRevision(
  source: DocumentRevision,
  input: { reason: string; revision?: string; actorId?: string | null },
): DocumentRevision {
  if (!REVISABLE_STATUSES.includes(source.status)) {
    throw new DocumentTransitionError(source.status, 'draft');
  }
  if (!input.reason?.trim()) throw new Error('reason for the new revision is required');
  return makeDocumentRevision({
    tenantId: source.tenantId,
    companyId: source.companyId,
    registerEntryId: source.registerEntryId,
    documentNumber: source.documentNumber,
    projectId: source.projectId,
    revision: input.revision?.trim() || nextRevision(source.revision),
    status: 'draft',
    previousRevision: source.revision,
    reasonForRevision: input.reason.trim(),
    createdBy: input.actorId ?? source.createdBy,
  });
}
