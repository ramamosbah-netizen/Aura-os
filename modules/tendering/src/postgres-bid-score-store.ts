import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { BidScore, BidCriterion } from './domain/bid-score';
import type { BidScoreFilter, BidScoreStore } from './bid-score-store';
import { BidScoreLockedError } from './bid-score-store';

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
  supersedes_id: string | null;
  amendment_reason: string | null;
  superseded_at: Date | string | null;
  superseded_by: string | null;
}

const COLS =
  'id, tenant_id, company_id, tender_id, tender_title, criteria, total_score, recommendation, notes, decided_by, created_by, created_at, supersedes_id, amendment_reason, superseded_at, superseded_by';

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
    supersedesId: r.supersedes_id,
    amendmentReason: r.amendment_reason,
    supersededAt: r.superseded_at instanceof Date ? r.superseded_at.toISOString() : r.superseded_at ? String(r.superseded_at) : null,
    supersededBy: r.superseded_by,
  };
}

/** Durable tender bid-scores on Postgres (`aura_tendering_bid_scores`). */
export class PostgresBidScoreStore implements BidScoreStore {
  constructor(private readonly pool: Pool) {}

  async save(s: BidScore): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      // Serialize confirmations for this tenant/tender across API processes. The subsequent
      // statement sees a competing transaction's committed decision before it can insert.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([s.tenantId, s.tenderId])]);
      const existing = await client.query('SELECT id FROM public.aura_tendering_bid_scores WHERE tenant_id = $1 AND tender_id = $2 AND superseded_at IS NULL LIMIT 1', [s.tenantId, s.tenderId]);
      if (existing.rows.length) throw new BidScoreLockedError();
      await client.query(
        `INSERT INTO public.aura_tendering_bid_scores (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [s.id, s.tenantId, s.companyId, s.tenderId, s.tenderTitle, JSON.stringify(s.criteria), s.totalScore, s.recommendation, s.notes, s.decidedBy, s.createdBy, s.createdAt, s.supersedesId, s.amendmentReason, s.supersededAt, s.supersededBy],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new BidScoreLockedError();
      throw error;
    } finally {
      client.release();
    }
  }

  async amend(previousId: Id, s: BidScore, actorId: Id): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([s.tenantId, s.tenderId])]);
      const active = await client.query<{ id: string }>(
        'SELECT id FROM public.aura_tendering_bid_scores WHERE tenant_id = $1 AND tender_id = $2 AND superseded_at IS NULL FOR UPDATE',
        [s.tenantId, s.tenderId],
      );
      if (active.rows.length !== 1 || active.rows[0].id !== previousId || s.supersedesId !== previousId || !s.amendmentReason) {
        throw new BidScoreLockedError();
      }
      await client.query(
        'UPDATE public.aura_tendering_bid_scores SET superseded_at = $1, superseded_by = $2 WHERE id = $3 AND tenant_id = $4 AND superseded_at IS NULL',
        [s.createdAt, actorId, previousId, s.tenantId],
      );
      await client.query(
        `INSERT INTO public.aura_tendering_bid_scores (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [s.id, s.tenantId, s.companyId, s.tenderId, s.tenderTitle, JSON.stringify(s.criteria), s.totalScore, s.recommendation, s.notes, s.decidedBy, s.createdBy, s.createdAt, s.supersedesId, s.amendmentReason, null, null],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new BidScoreLockedError();
      throw error;
    } finally {
      client.release();
    }
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
