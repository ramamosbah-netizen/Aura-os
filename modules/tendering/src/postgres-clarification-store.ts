import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TenderClarification } from './domain/clarification';
import type { ClarificationFilter, ClarificationStore } from './clarification-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  kind: string;
  reference: string | null;
  title: string;
  body: string | null;
  issued_at: Date | string;
  response_due: Date | string | null;
  answer: string | null;
  answered_at: Date | string | null;
  deadline_extended_to: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, tender_id, kind, reference, title, body, issued_at, response_due, answer, answered_at, deadline_extended_to, created_by, created_at';

const isoDate = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
const iso = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString() : String(v);

function rowToClarification(r: Row): TenderClarification {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    kind: r.kind as TenderClarification['kind'],
    reference: r.reference,
    title: r.title,
    body: r.body,
    issuedAt: isoDate(r.issued_at) as string,
    responseDue: isoDate(r.response_due),
    answer: r.answer,
    answeredAt: iso(r.answered_at),
    deadlineExtendedTo: isoDate(r.deadline_extended_to),
    createdBy: r.created_by,
    createdAt: iso(r.created_at) as string,
  };
}

/** Durable tender clarifications/addenda on Postgres (`aura_tendering_clarifications`). */
export class PostgresClarificationStore implements ClarificationStore {
  constructor(private readonly pool: Pool) {}

  async save(c: TenderClarification): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_clarifications (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         reference = EXCLUDED.reference, title = EXCLUDED.title, body = EXCLUDED.body,
         response_due = EXCLUDED.response_due, answer = EXCLUDED.answer,
         answered_at = EXCLUDED.answered_at, deadline_extended_to = EXCLUDED.deadline_extended_to`,
      [c.id, c.tenantId, c.companyId, c.tenderId, c.kind, c.reference, c.title, c.body, c.issuedAt, c.responseDue, c.answer, c.answeredAt, c.deadlineExtendedTo, c.createdBy, c.createdAt],
    );
  }

  async get(id: Id): Promise<TenderClarification | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_clarifications WHERE id = $1`, [id]);
    return res.rows.length ? rowToClarification(res.rows[0]) : null;
  }

  private buildWhere(filter: ClarificationFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('tender_id', filter.tenderId);
    add('kind', filter.kind);
    if (filter.open) where.push('answered_at IS NULL');
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: ClarificationFilter = {}): Promise<TenderClarification[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_clarifications ${whereSql} ORDER BY issued_at DESC, created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToClarification);
  }

  async listPaged(filter: ClarificationFilter, page: PageParams): Promise<Page<TenderClarification>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_tendering_clarifications ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_clarifications ${whereSql} ORDER BY issued_at DESC, created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToClarification), total, page);
  }
}
