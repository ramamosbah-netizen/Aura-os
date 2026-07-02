import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TenderOutcome, CompetitorBid } from './domain/win-loss';
import type { TenderOutcomeFilter, TenderOutcomeStore } from './win-loss-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  tender_title: string | null;
  result: string;
  our_bid_value: string | number;
  competitors: unknown;
  winner_name: string | null;
  reason: string | null;
  decided_at: Date | string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, tender_id, tender_title, result, our_bid_value, competitors, winner_name, reason, decided_at, created_by, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToOutcome(r: Row): TenderOutcome {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    tenderTitle: r.tender_title,
    result: r.result as TenderOutcome['result'],
    ourBidValue: Number(r.our_bid_value),
    competitors: (typeof r.competitors === 'string' ? JSON.parse(r.competitors) : r.competitors) as CompetitorBid[],
    winnerName: r.winner_name,
    reason: r.reason,
    decidedAt: iso(r.decided_at),
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

/** Durable tender outcomes on Postgres (`aura_tendering_outcomes`). */
export class PostgresTenderOutcomeStore implements TenderOutcomeStore {
  constructor(private readonly pool: Pool) {}

  async save(o: TenderOutcome): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_outcomes (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         result = EXCLUDED.result, our_bid_value = EXCLUDED.our_bid_value, competitors = EXCLUDED.competitors,
         winner_name = EXCLUDED.winner_name, reason = EXCLUDED.reason, decided_at = EXCLUDED.decided_at`,
      [o.id, o.tenantId, o.companyId, o.tenderId, o.tenderTitle, o.result, o.ourBidValue, JSON.stringify(o.competitors), o.winnerName, o.reason, o.decidedAt, o.createdBy, o.createdAt],
    );
  }

  async get(id: Id): Promise<TenderOutcome | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_tendering_outcomes WHERE id = $1`, [id]);
    return res.rows.length ? rowToOutcome(res.rows[0]) : null;
  }

  private buildWhere(filter: TenderOutcomeFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('tender_id', filter.tenderId);
    add('result', filter.result);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: TenderOutcomeFilter = {}): Promise<TenderOutcome[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_outcomes ${whereSql} ORDER BY decided_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToOutcome);
  }

  async listPaged(filter: TenderOutcomeFilter, page: PageParams): Promise<Page<TenderOutcome>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_tendering_outcomes ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_outcomes ${whereSql} ORDER BY decided_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToOutcome), total, page);
  }
}
