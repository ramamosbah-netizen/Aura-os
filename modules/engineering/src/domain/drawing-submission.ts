import { type Id, newId } from '@aura/shared';

/**
 * A Submission is the review-transaction record created when a drawing revision is submitted for
 * review (G-32). It is an immutable audit row: who submitted which revision to whom, why, and by
 * when. The drawing revision holds the *current* status; the submission holds the *transaction*.
 */
export interface DrawingSubmission {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  drawingId: Id;
  drawingCode: string;
  revision: string;
  projectId: Id;
  submittedBy: Id | null;
  submittedAt: string;
  recipient: string | null;
  purpose: string | null;
  dueDate: string | null;
  comments: string | null;
}

export interface NewDrawingSubmission {
  tenantId: Id;
  companyId?: Id | null;
  drawingId: Id;
  drawingCode: string;
  revision: string;
  projectId: Id;
  submittedBy?: Id | null;
  recipient?: string | null;
  purpose?: string | null;
  dueDate?: string | null;
  comments?: string | null;
}

export function makeDrawingSubmission(input: NewDrawingSubmission): DrawingSubmission {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    drawingId: input.drawingId,
    drawingCode: input.drawingCode,
    revision: input.revision,
    projectId: input.projectId,
    submittedBy: input.submittedBy ?? null,
    submittedAt: new Date().toISOString(),
    recipient: input.recipient?.trim() || null,
    purpose: input.purpose?.trim() || null,
    dueDate: input.dueDate ?? null,
    comments: input.comments?.trim() || null,
  };
}
