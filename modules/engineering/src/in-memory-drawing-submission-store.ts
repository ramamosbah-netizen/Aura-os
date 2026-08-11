import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingSubmission } from './domain/drawing-submission';
import type { DrawingSubmissionStore } from './drawing-submission-store';

export class InMemoryDrawingSubmissionStore implements DrawingSubmissionStore {
  private readonly items = new Map<string, DrawingSubmission>();

  async create(s: DrawingSubmission): Promise<void> {
    this.items.set(s.id, { ...s });
  }

  async createWithClient(_tx: TxHandle | null, s: DrawingSubmission): Promise<void> {
    await this.create(s);
  }

  async listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingSubmission[]> {
    return [...this.items.values()]
      .filter((s) => s.tenantId === tenantId && s.drawingId === drawingId)
      .map((s) => ({ ...s }))
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }

  async listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingSubmission[]> {
    return [...this.items.values()]
      .filter((s) => s.tenantId === tenantId && s.projectId === projectId && s.drawingCode === drawingCode)
      .map((s) => ({ ...s }))
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }
}
