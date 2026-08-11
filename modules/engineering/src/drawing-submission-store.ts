import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingSubmission } from './domain/drawing-submission';

export interface DrawingSubmissionStore {
  create(submission: DrawingSubmission): Promise<void>;
  createWithClient(tx: TxHandle | null, submission: DrawingSubmission): Promise<void>;
  /** Submissions for one drawing revision-row (by drawingId), newest first. */
  listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingSubmission[]>;
  /** All submissions for a logical drawing (by code across revisions), newest first. */
  listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingSubmission[]>;
}

export const DRAWING_SUBMISSION_STORE = Symbol('DrawingSubmissionStore');
