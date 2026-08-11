import { type Id, newId } from '@aura/shared';
import { type Discipline, toDiscipline } from './discipline';

/**
 * Shop-drawing lifecycle (G-32). A drawing REVISION is the aggregate: each (project, code, revision)
 * is one immutable row that walks a controlled state machine. Revising never overwrites a revision
 * in place — it creates the NEXT revision row (in `draft`) and marks the source `superseded`, so the
 * full revision history is durable and auditable, not reconstructable-only-from-events.
 *
 *   draft ─submit→ submitted ─start_review→ under_review ─┬─approve→ approved ─transmit→ transmitted ─close→ closed
 *                                                          ├─reject→ rejected            ─────────────revise──────────┐
 *                                                          └─return→ revision_required ──────────────revise──────────┤
 *   rejected / revision_required / approved / transmitted / closed ──revise→ (new revision @ draft), source→superseded
 *
 * A `closed` (or `superseded`) revision is immutable: no further transition is legal on it; the only
 * forward move for an issued drawing is to raise a new revision.
 */
export type DrawingStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_required'
  | 'transmitted'
  | 'closed'
  | 'superseded';

/** Allowed forward transitions per status. Empty array = terminal (revise is the only escape). */
export const DRAWING_TRANSITIONS: Record<DrawingStatus, DrawingStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected', 'revision_required'],
  approved: ['transmitted'],
  transmitted: ['closed'],
  rejected: [],
  revision_required: [],
  closed: [],
  superseded: [],
};

/** A revision may be revised (→ next revision) once it has left draft and is not already superseded. */
export const REVISABLE_STATUSES: readonly DrawingStatus[] = [
  'rejected',
  'revision_required',
  'approved',
  'transmitted',
  'closed',
];

export interface Drawing {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  revision: string;
  status: DrawingStatus;
  discipline: Discipline;
  projectId: Id;
  projectName: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  // ── revision lineage ──────────────────────────────────────────────────────
  /** the revision this one supersedes (null for the first revision). */
  previousRevision: string | null;
  /** why this revision was raised (immutable, set at revise time). */
  reasonForRevision: string | null;
  /** document/file backing this revision. */
  fileUrl: string | null;
  // ── workflow stamps ───────────────────────────────────────────────────────
  submittedBy: Id | null;
  submittedAt: string | null;
  reviewedBy: Id | null;
  reviewedAt: string | null;
  decidedBy: Id | null;
  decidedAt: string | null;
  /** doccontrol transmittal that conveyed this revision (set by the transmit reactor / command). */
  transmittalRef: string | null;
  transmittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDrawing {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  revision?: string;
  status?: DrawingStatus;
  discipline?: Discipline;
  projectId: Id;
  projectName?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
  previousRevision?: string | null;
  reasonForRevision?: string | null;
  fileUrl?: string | null;
}

export function makeDrawing(input: NewDrawing): Drawing {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    revision: input.revision?.trim() || '0',
    status: input.status ?? 'draft',
    discipline: toDiscipline(input.discipline),
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    previousRevision: input.previousRevision ?? null,
    reasonForRevision: input.reasonForRevision ?? null,
    fileUrl: input.fileUrl ?? null,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    decidedBy: null,
    decidedAt: null,
    transmittalRef: null,
    transmittedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class DrawingTransitionError extends Error {
  constructor(from: DrawingStatus, to: DrawingStatus) {
    // Phrased with "can only" so the API error taxonomy classifies it 409 CONFLICT (a well-formed
    // request the aggregate's current state forbids), not 500. See all-exceptions.filter.ts.
    super(`a '${from}' drawing can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'DrawingTransitionError';
  }
}

export function canTransitionDrawing(from: DrawingStatus, to: DrawingStatus): boolean {
  return DRAWING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertDrawingTransition(from: DrawingStatus, to: DrawingStatus): void {
  if (!canTransitionDrawing(from, to)) throw new DrawingTransitionError(from, to);
}

/** Next revision label: numeric `01`→`02` (preserving zero-pad width), alpha `A`→`B`, else suffixed. */
export function nextRevision(current: string): string {
  const c = current.trim();
  if (/^\d+$/.test(c)) {
    const next = String(Number(c) + 1);
    return next.padStart(c.length, '0');
  }
  if (/^[A-Za-z]$/.test(c)) return String.fromCharCode(c.charCodeAt(0) + 1);
  return `${c}.1`;
}

const touch = (d: Drawing): Drawing => ({ ...d, updatedAt: new Date().toISOString() });

/** draft → submitted. Stamps the submitter. */
export function submitDrawing(d: Drawing, actorId: Id | null): Drawing {
  assertDrawingTransition(d.status, 'submitted');
  const now = new Date().toISOString();
  return { ...touch(d), status: 'submitted', submittedBy: actorId, submittedAt: now };
}

/** submitted → under_review. Stamps the reviewer who picked it up. */
export function startReviewDrawing(d: Drawing, reviewerId: Id | null): Drawing {
  assertDrawingTransition(d.status, 'under_review');
  return { ...touch(d), status: 'under_review', reviewedBy: reviewerId, reviewedAt: new Date().toISOString() };
}

export type ReviewDecision = 'approved' | 'rejected' | 'revision_required';

/** under_review → approved | rejected | revision_required. Stamps the decider. */
export function decideDrawing(d: Drawing, decision: ReviewDecision, actorId: Id | null): Drawing {
  assertDrawingTransition(d.status, decision);
  const now = new Date().toISOString();
  return { ...touch(d), status: decision, reviewedBy: actorId ?? d.reviewedBy, decidedBy: actorId, decidedAt: now };
}

/** approved → transmitted. Records the conveying transmittal reference. */
export function transmitDrawing(d: Drawing, transmittalRef: string | null): Drawing {
  assertDrawingTransition(d.status, 'transmitted');
  return { ...touch(d), status: 'transmitted', transmittalRef, transmittedAt: new Date().toISOString() };
}

/** transmitted → closed. Immutable thereafter. */
export function closeDrawing(d: Drawing): Drawing {
  assertDrawingTransition(d.status, 'closed');
  return { ...touch(d), status: 'closed', closedAt: new Date().toISOString() };
}

/**
 * Raise the next revision of an issued/returned drawing. Returns the NEW draft revision plus the
 * SUPERSEDED source (the caller persists both in one transaction). Fails closed if the source is not
 * in a revisable status — a `draft`/`submitted`/`under_review`/`superseded` revision cannot be revised.
 */
export function reviseDrawing(
  source: Drawing,
  input: { reason: string; revision?: string; title?: string; fileUrl?: string | null; actorId?: Id | null },
): { revised: Drawing; superseded: Drawing } {
  if (!REVISABLE_STATUSES.includes(source.status)) {
    throw new DrawingTransitionError(source.status, 'superseded');
  }
  const reason = input.reason?.trim();
  if (!reason) throw new Error('reason for revision is required');

  const revised = makeDrawing({
    tenantId: source.tenantId,
    companyId: source.companyId,
    code: source.code,
    title: input.title?.trim() || source.title,
    revision: input.revision?.trim() || nextRevision(source.revision),
    status: 'draft',
    discipline: source.discipline,
    projectId: source.projectId,
    projectName: source.projectName,
    ownerId: source.ownerId,
    createdBy: input.actorId ?? source.ownerId,
    previousRevision: source.revision,
    reasonForRevision: reason,
    fileUrl: input.fileUrl ?? null,
  });
  const superseded = { ...touch(source), status: 'superseded' as DrawingStatus };
  return { revised, superseded };
}

export const ENGINEERING_EVENT = {
  drawingCreated: 'engineering.drawing.created',
  drawingSubmitted: 'engineering.drawing.submitted',
  drawingReviewStarted: 'engineering.drawing.review_started',
  drawingApproved: 'engineering.drawing.approved',
  drawingRejected: 'engineering.drawing.rejected',
  drawingRevisionRequired: 'engineering.drawing.revision_required',
  drawingRevised: 'engineering.drawing.revised',
  drawingTransmitted: 'engineering.drawing.transmitted',
  drawingClosed: 'engineering.drawing.closed',
  rfiRaised: 'engineering.rfi.raised',
  rfiAnswered: 'engineering.rfi.answered',
  submittalCreated: 'engineering.submittal.created',
  submittalStatusChanged: 'engineering.submittal.status_changed',
  tqRaised: 'engineering.tq.raised',
  tqResponded: 'engineering.tq.responded',
} as const;
