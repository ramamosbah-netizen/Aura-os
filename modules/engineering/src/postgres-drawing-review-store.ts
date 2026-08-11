import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingReview, ReviewOutcome } from './domain/drawing-review';
import type { DrawingReviewStore } from './drawing-review-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  drawing_id: string;
  drawing_code: string;
  revision: string;
  project_id: string;
  reviewed_by: string | null;
  reviewed_at: Date | string;
  outcome: string;
  comments: string | null;
}

const COLS =
  'id, tenant_id, company_id, drawing_id, drawing_code, revision, project_id, reviewed_by, reviewed_at, outcome, comments';

function toDomain(r: Row): DrawingReview {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    drawingId: r.drawing_id,
    drawingCode: r.drawing_code,
    revision: r.revision,
    projectId: r.project_id,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : String(r.reviewed_at),
    outcome: r.outcome as ReviewOutcome,
    comments: r.comments,
  };
}

export class PostgresDrawingReviewStore implements DrawingReviewStore {
  constructor(private readonly pool: Pool) {}

  async create(r: DrawingReview): Promise<void> {
    await this.insert(this.pool, r);
  }

  async createWithClient(tx: TxHandle | null, r: DrawingReview): Promise<void> {
    if (tx === null) return this.create(r);
    await this.insert(tx as PoolClient, r);
  }

  private insert(executor: Pool | PoolClient, r: DrawingReview): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_drawing_reviews (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        r.id, r.tenantId, r.companyId, r.drawingId, r.drawingCode, r.revision, r.projectId, r.reviewedBy,
        r.reviewedAt, r.outcome, r.comments,
      ],
    );
  }

  async listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingReview[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawing_reviews
       WHERE tenant_id = $1 AND drawing_id = $2 ORDER BY reviewed_at DESC`,
      [tenantId, drawingId],
    );
    return res.rows.map(toDomain);
  }

  async listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingReview[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawing_reviews
       WHERE tenant_id = $1 AND project_id = $2 AND drawing_code = $3 ORDER BY reviewed_at DESC`,
      [tenantId, projectId, drawingCode],
    );
    return res.rows.map(toDomain);
  }
}
