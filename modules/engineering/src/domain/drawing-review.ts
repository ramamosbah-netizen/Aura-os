import { type Id, newId } from '@aura/shared';

/**
 * A Review is the immutable record of a reviewer's decision on a submitted drawing revision (G-32).
 * `approved_with_comments` is an approval that still carries remarks; it maps to the `approved`
 * drawing transition. `returned_for_revision` maps to `revision_required`. The record captures the
 * verbatim comment so the rejection reason is auditable and shown back to the engineer.
 */
export type ReviewOutcome =
  | 'approved'
  | 'approved_with_comments'
  | 'rejected'
  | 'returned_for_revision';

/** Map a review outcome to the drawing state-machine decision it drives. */
export function outcomeToDecision(o: ReviewOutcome): 'approved' | 'rejected' | 'revision_required' {
  switch (o) {
    case 'approved':
    case 'approved_with_comments':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'returned_for_revision':
      return 'revision_required';
  }
}

export interface DrawingReview {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  drawingId: Id;
  drawingCode: string;
  revision: string;
  projectId: Id;
  reviewedBy: Id | null;
  reviewedAt: string;
  outcome: ReviewOutcome;
  comments: string | null;
}

export interface NewDrawingReview {
  tenantId: Id;
  companyId?: Id | null;
  drawingId: Id;
  drawingCode: string;
  revision: string;
  projectId: Id;
  reviewedBy?: Id | null;
  outcome: ReviewOutcome;
  comments?: string | null;
}

const OUTCOMES: readonly ReviewOutcome[] = ['approved', 'approved_with_comments', 'rejected', 'returned_for_revision'];

export function isReviewOutcome(v: string | null | undefined): v is ReviewOutcome {
  return !!v && OUTCOMES.includes(v as ReviewOutcome);
}

export function makeDrawingReview(input: NewDrawingReview): DrawingReview {
  if (!isReviewOutcome(input.outcome)) throw new Error(`unknown review outcome: ${input.outcome}`);
  // A rejection / return must carry a reason — the engineer needs to know what to fix.
  if ((input.outcome === 'rejected' || input.outcome === 'returned_for_revision') && !input.comments?.trim()) {
    throw new Error('a rejection or return-for-revision requires comments');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    drawingId: input.drawingId,
    drawingCode: input.drawingCode,
    revision: input.revision,
    projectId: input.projectId,
    reviewedBy: input.reviewedBy ?? null,
    reviewedAt: new Date().toISOString(),
    outcome: input.outcome,
    comments: input.comments?.trim() || null,
  };
}
