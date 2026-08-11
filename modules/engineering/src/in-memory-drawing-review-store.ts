import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingReview } from './domain/drawing-review';
import type { DrawingReviewStore } from './drawing-review-store';

export class InMemoryDrawingReviewStore implements DrawingReviewStore {
  private readonly items = new Map<string, DrawingReview>();

  async create(r: DrawingReview): Promise<void> {
    this.items.set(r.id, { ...r });
  }

  async createWithClient(_tx: TxHandle | null, r: DrawingReview): Promise<void> {
    await this.create(r);
  }

  async listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingReview[]> {
    return [...this.items.values()]
      .filter((r) => r.tenantId === tenantId && r.drawingId === drawingId)
      .map((r) => ({ ...r }))
      .sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1));
  }

  async listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingReview[]> {
    return [...this.items.values()]
      .filter((r) => r.tenantId === tenantId && r.projectId === projectId && r.drawingCode === drawingCode)
      .map((r) => ({ ...r }))
      .sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1));
  }
}
