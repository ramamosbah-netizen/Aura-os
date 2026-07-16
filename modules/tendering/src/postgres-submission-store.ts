import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TenderSubmission } from './domain/submission';
import type { SubmissionFilter, SubmissionStore } from './submission-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  tender_title: string | null;
  submitted_at: Date | string;
  submitted_by: string | null;
  method: string;
  portal: string | null;
  reference: string | null;
  submitted_value: string | number;
  addenda_acknowledged: string | null;
  valid_until: Date | string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, tender_id, tender_title, submitted_at, submitted_by, method, portal, reference, submitted_value, addenda_acknowledged, valid_until, notes, created_by, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const isoDate = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

function rowToSubmission(r: Row): TenderSubmission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    tenderTitle: r.tender_title,
    submittedAt: iso(r.submitted_at),
    submittedBy: r.submitted_by,
    method: r.method as TenderSubmission['method'],
    portal: r.portal,
    reference: r.reference,
    submittedValue: Number(r.submitted_value),
    addendaAcknowledged: r.addenda_acknowledged,
    validUntil: isoDate(r.valid_until),
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

/** Durable tender submissions on Postgres (`aura_tendering_submissions`). */
export class PostgresSubmissionStore implements SubmissionStore {
  constructor(private readonly pool: Pool) {}

  async save(s: TenderSubmission): Promise<void> {
    await this.insert(this.pool, s);
  }

  async saveWithClient(tx: TxHandle | null, s: TenderSubmission): Promise<void> {
    if (tx === null) return this.save(s);
    await this.insert(tx as PoolClient, s);
  }

  private insert(executor: Pool | PoolClient, s: TenderSubmission): Promise<unknown> {
    // The record is a fact — a conflicting re-save may only correct its annotations
    // (reference, portal, addenda, validity, notes), never when/who/how much.
    return executor.query(
      `INSERT INTO public.aura_tendering_submissions (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         portal = EXCLUDED.portal, reference = EXCLUDED.reference,
         addenda_acknowledged = EXCLUDED.addenda_acknowledged,
         valid_until = EXCLUDED.valid_until, notes = EXCLUDED.notes`,
      [s.id, s.tenantId, s.companyId, s.tenderId, s.tenderTitle, s.submittedAt, s.submittedBy, s.method, s.portal, s.reference, s.submittedValue, s.addendaAcknowledged, s.validUntil, s.notes, s.createdBy, s.createdAt],
    );
  }

  async get(id: Id): Promise<TenderSubmission | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_submissions WHERE id = $1`, [id]);
    return res.rows.length ? rowToSubmission(res.rows[0]) : null;
  }

  private buildWhere(filter: SubmissionFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('tender_id', filter.tenderId);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: SubmissionFilter = {}): Promise<TenderSubmission[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_submissions ${whereSql} ORDER BY submitted_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToSubmission);
  }

  async listPaged(filter: SubmissionFilter, page: PageParams): Promise<Page<TenderSubmission>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_tendering_submissions ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_submissions ${whereSql} ORDER BY submitted_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToSubmission), total, page);
  }
}
