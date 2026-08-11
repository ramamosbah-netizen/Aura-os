import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingReview } from './domain/drawing-review';

export interface DrawingReviewStore {
  create(review: DrawingReview): Promise<void>;
  createWithClient(tx: TxHandle | null, review: DrawingReview): Promise<void>;
  /** Reviews for one drawing revision-row (by drawingId), newest first. */
  listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingReview[]>;
  /** All reviews for a logical drawing (by code across revisions), newest first. */
  listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingReview[]>;
}

export const DRAWING_REVIEW_STORE = Symbol('DrawingReviewStore');
