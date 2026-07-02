import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { PostDatedCheque } from './domain/post-dated-cheque';
import type { PostDatedChequeFilter, PostDatedChequeStore } from './post-dated-cheque-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  cheque_number: string;
  direction: string;
  party_name: string;
  bank_name: string;
  amount: string | number;
  currency: string;
  issue_date: string;
  maturity_date: string;
  status: string;
  reference: string | null;
  bounce_count: number;
  notes: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, cheque_number, direction, party_name, bank_name, amount, currency, ' +
  'issue_date::text AS issue_date, maturity_date::text AS maturity_date, status, reference, bounce_count, notes, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): PostDatedCheque {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    chequeNumber: r.cheque_number,
    direction: r.direction as PostDatedCheque['direction'],
    partyName: r.party_name,
    bankName: r.bank_name,
    amount: Number(r.amount),
    currency: r.currency,
    issueDate: String(r.issue_date),
    maturityDate: String(r.maturity_date),
    status: r.status as PostDatedCheque['status'],
    reference: r.reference,
    bounceCount: Number(r.bounce_count),
    notes: r.notes || '',
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresPostDatedChequeStore implements PostDatedChequeStore {
  constructor(private readonly pool: Pool) {}

  async save(c: PostDatedCheque): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_post_dated_cheques
        (id, tenant_id, company_id, cheque_number, direction, party_name, bank_name, amount, currency, issue_date, maturity_date, status, reference, bounce_count, notes, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, bounce_count = EXCLUDED.bounce_count, notes = EXCLUDED.notes`,
      [
        c.id, c.tenantId, c.companyId, c.chequeNumber, c.direction, c.partyName, c.bankName, c.amount, c.currency,
        c.issueDate, c.maturityDate, c.status, c.reference, c.bounceCount, c.notes, c.createdBy, c.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<PostDatedCheque | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_post_dated_cheques WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: PostDatedChequeFilter = {}): Promise<PostDatedCheque[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('direction', filter.direction);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_post_dated_cheques ${whereSql} ORDER BY maturity_date ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async listPaged(filter: PostDatedChequeFilter, page: PageParams): Promise<Page<PostDatedCheque>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('direction', filter.direction);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_finance_post_dated_cheques ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_post_dated_cheques ${whereSql} ORDER BY maturity_date ASC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowTo), total, page);
  }
}
