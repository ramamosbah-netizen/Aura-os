import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { DelayEvent, EotClaim, DelayCause, DelayStatus, EotStatus } from './domain/delay-eot';
import type { DelayFilter, DelayStore, EotFilter, EotStore } from './delay-eot-store';

// ── Delay Event PG Store ───────────────────────────────────────────────────

interface DelayRow {
  id: string;
  tenant_id: string;
  project_id: string;
  title: string;
  cause_category: string;
  start_date: string;
  end_date: string | null;
  delay_days: number;
  is_concurrent: boolean;
  linked_activity_code: string | null;
  description: string | null;
  status: string;
  created_at: Date | string;
}

function rowToDelay(r: DelayRow): DelayEvent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    title: r.title,
    causeCategory: r.cause_category as DelayCause,
    startDate: typeof r.start_date === 'string' ? r.start_date : String(r.start_date),
    endDate: r.end_date,
    delayDays: Number(r.delay_days),
    isConcurrent: r.is_concurrent,
    linkedActivityCode: r.linked_activity_code,
    description: r.description,
    status: r.status as DelayStatus,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresDelayStore implements DelayStore {
  constructor(private readonly pool: Pool) {}

  async create(e: DelayEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_delay_events
        (id, tenant_id, project_id, title, cause_category, start_date, end_date, delay_days,
         is_concurrent, linked_activity_code, description, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [e.id, e.tenantId, e.projectId, e.title, e.causeCategory, e.startDate,
       e.endDate, e.delayDays, e.isConcurrent, e.linkedActivityCode,
       e.description, e.status, e.createdAt],
    );
  }

  async update(e: DelayEvent): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_delay_events
       SET title=$2, cause_category=$3, start_date=$4, end_date=$5, delay_days=$6,
           is_concurrent=$7, linked_activity_code=$8, description=$9, status=$10
       WHERE id=$1`,
      [e.id, e.title, e.causeCategory, e.startDate, e.endDate, e.delayDays,
       e.isConcurrent, e.linkedActivityCode, e.description, e.status],
    );
  }

  async get(id: Id): Promise<DelayEvent | null> {
    const res = await this.pool.query<DelayRow>(
      'SELECT * FROM public.aura_projects_delay_events WHERE id = $1', [id],
    );
    return res.rows.length ? rowToDelay(res.rows[0]) : null;
  }

  async list(filter: DelayFilter = {}): Promise<DelayEvent[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.causeCategory) { params.push(filter.causeCategory); where.push(`cause_category = $${params.length}`); }
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<DelayRow>(
      `SELECT * FROM public.aura_projects_delay_events ${w} ORDER BY start_date DESC`, params,
    );
    return res.rows.map(rowToDelay);
  }
}

// ── EOT Claim PG Store ─────────────────────────────────────────────────────

interface EotRow {
  id: string;
  tenant_id: string;
  project_id: string;
  claim_number: number;
  title: string;
  submitted_days: number;
  approved_days: number;
  status: string;
  justification: string | null;
  original_completion_date: string | null;
  revised_completion_date: string | null;
  submitted_at: Date | string | null;
  decided_at: Date | string | null;
  decided_by: string | null;
  created_at: Date | string;
}

function rowToEot(r: EotRow): EotClaim {
  const ts = (v: Date | string | null) => {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : String(v);
  };
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    claimNumber: r.claim_number,
    title: r.title,
    submittedDays: Number(r.submitted_days),
    approvedDays: Number(r.approved_days),
    status: r.status as EotStatus,
    justification: r.justification,
    originalCompletionDate: r.original_completion_date,
    revisedCompletionDate: r.revised_completion_date,
    submittedAt: ts(r.submitted_at),
    decidedAt: ts(r.decided_at),
    decidedBy: r.decided_by,
    delayEventIds: [],   // populated separately if needed
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresEotStore implements EotStore {
  constructor(private readonly pool: Pool) {}

  async create(c: EotClaim): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_eot_claims
        (id, tenant_id, project_id, claim_number, title, submitted_days, approved_days,
         status, justification, original_completion_date, revised_completion_date,
         submitted_at, decided_at, decided_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [c.id, c.tenantId, c.projectId, c.claimNumber, c.title, c.submittedDays,
       c.approvedDays, c.status, c.justification, c.originalCompletionDate,
       c.revisedCompletionDate, c.submittedAt, c.decidedAt, c.decidedBy, c.createdAt],
    );
    // link delay events
    for (const dId of c.delayEventIds) {
      await this.pool.query(
        'INSERT INTO public.aura_projects_eot_delay_links (eot_claim_id, delay_event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [c.id, dId],
      );
    }
  }

  async update(c: EotClaim): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_eot_claims
       SET title=$2, submitted_days=$3, approved_days=$4, status=$5, justification=$6,
           original_completion_date=$7, revised_completion_date=$8,
           submitted_at=$9, decided_at=$10, decided_by=$11
       WHERE id=$1`,
      [c.id, c.title, c.submittedDays, c.approvedDays, c.status, c.justification,
       c.originalCompletionDate, c.revisedCompletionDate, c.submittedAt,
       c.decidedAt, c.decidedBy],
    );
  }

  async get(id: Id): Promise<EotClaim | null> {
    const res = await this.pool.query<EotRow>(
      'SELECT * FROM public.aura_projects_eot_claims WHERE id = $1', [id],
    );
    if (!res.rows.length) return null;
    const claim = rowToEot(res.rows[0]);
    // load linked delay event IDs
    const links = await this.pool.query<{ delay_event_id: string }>(
      'SELECT delay_event_id FROM public.aura_projects_eot_delay_links WHERE eot_claim_id = $1',
      [id],
    );
    claim.delayEventIds = links.rows.map((r) => r.delay_event_id);
    return claim;
  }

  async list(filter: EotFilter = {}): Promise<EotClaim[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<EotRow>(
      `SELECT * FROM public.aura_projects_eot_claims ${w} ORDER BY claim_number ASC`, params,
    );
    return res.rows.map(rowToEot);
  }
}
