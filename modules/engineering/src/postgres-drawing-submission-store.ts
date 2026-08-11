import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DrawingSubmission } from './domain/drawing-submission';
import type { DrawingSubmissionStore } from './drawing-submission-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  drawing_id: string;
  drawing_code: string;
  revision: string;
  project_id: string;
  submitted_by: string | null;
  submitted_at: Date | string;
  recipient: string | null;
  purpose: string | null;
  due_date: Date | string | null;
  comments: string | null;
}

const COLS =
  'id, tenant_id, company_id, drawing_id, drawing_code, revision, project_id, submitted_by, submitted_at, recipient, purpose, due_date, comments';

const iso = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString() : String(v);

function toDomain(r: Row): DrawingSubmission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    drawingId: r.drawing_id,
    drawingCode: r.drawing_code,
    revision: r.revision,
    projectId: r.project_id,
    submittedBy: r.submitted_by,
    submittedAt: iso(r.submitted_at) as string,
    recipient: r.recipient,
    purpose: r.purpose,
    dueDate: r.due_date ? String(iso(r.due_date)).slice(0, 10) : null,
    comments: r.comments,
  };
}

export class PostgresDrawingSubmissionStore implements DrawingSubmissionStore {
  constructor(private readonly pool: Pool) {}

  async create(s: DrawingSubmission): Promise<void> {
    await this.insert(this.pool, s);
  }

  async createWithClient(tx: TxHandle | null, s: DrawingSubmission): Promise<void> {
    if (tx === null) return this.create(s);
    await this.insert(tx as PoolClient, s);
  }

  private insert(executor: Pool | PoolClient, s: DrawingSubmission): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_drawing_submissions (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        s.id, s.tenantId, s.companyId, s.drawingId, s.drawingCode, s.revision, s.projectId, s.submittedBy,
        s.submittedAt, s.recipient, s.purpose, s.dueDate, s.comments,
      ],
    );
  }

  async listByDrawing(tenantId: Id, drawingId: Id): Promise<DrawingSubmission[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawing_submissions
       WHERE tenant_id = $1 AND drawing_id = $2 ORDER BY submitted_at DESC`,
      [tenantId, drawingId],
    );
    return res.rows.map(toDomain);
  }

  async listByCode(tenantId: Id, projectId: Id, drawingCode: string): Promise<DrawingSubmission[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawing_submissions
       WHERE tenant_id = $1 AND project_id = $2 AND drawing_code = $3 ORDER BY submitted_at DESC`,
      [tenantId, projectId, drawingCode],
    );
    return res.rows.map(toDomain);
  }
}
