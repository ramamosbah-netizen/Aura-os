import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { BidScore, BidCriterion } from './domain/bid-score';
import type { BidScoreFilter, BidScoreStore } from './bid-score-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  tender_title: string | null;
  criteria: unknown;
  total_score: string | number;
  recommendation: string;
  notes: string | null;
  decided_by: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, tender_id, tender_title, criteria, total_score, recommendation, notes, decided_by, created_by, created_at';

function rowToScore(r: Row): BidScore {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    tenderTitle: r.tender_title,
    criteria: (typeof r.criteria === 'string' ? JSON.parse(r.criteria) : r.criteria) as BidCriterion[],
    totalScore: Number(r.total_score),
    recommendation: r.recommendation as BidScore['recommendation'],
    notes: r.notes,
    decidedBy: r.decided_by,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable tender bid-scores on Postgres (`aura_tendering_bid_scores`). */
export class PostgresBidScoreStore implements BidScoreStore {
  constructor(private readonly pool: Pool) {}

  async save(s: BidScore): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_bid_scores (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         criteria = EXCLUDED.criteria, total_score = EXCLUDED.total_score,
         recommendation = EXCLUDED.recommendation, notes = EXCLUDED.notes, decided_by = EXCLUDED.decided_by`,
      [s.id, s.tenantId, s.companyId, s.tenderId, s.tenderTitle, JSON.stringify(s.criteria), s.totalScore, s.recommendation, s.notes, s.decidedBy, s.createdBy, s.createdAt],
    );
  }

  async get(id: Id): Promise<BidScore | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_tendering_bid_scores WHERE id = $1`, [id]);
    return res.rows.length ? rowToScore(res.rows[0]) : null;
  }

  private buildWhere(filter: BidScoreFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('tender_id', filter.tenderId);
    add('recommendation', filter.recommendation);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: BidScoreFilter = {}): Promise<BidScore[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_bid_scores ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToScore);
  }

  async listPaged(filter: BidScoreFilter, page: PageParams): Promise<Page<BidScore>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_tendering_bid_scores ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_bid_scores ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToScore), total, page);
  }
}
