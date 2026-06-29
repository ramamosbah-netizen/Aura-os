import type { Pool, PoolClient } from 'pg';
import type { Id, Opportunity, OpportunityStage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { OpportunityFilter, OpportunityStore } from './opportunity-store';

interface OppRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  lead_id: string | null;
  title: string;
  value: string;
  stage: string;
  win_probability: string;
  close_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = 'id, tenant_id, company_id, lead_id, title, value, stage, win_probability, close_date, created_at, updated_at';

function rowToOpportunity(r: OppRow): Opportunity {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    leadId: r.lead_id,
    title: r.title,
    value: Number(r.value),
    stage: r.stage as OpportunityStage,
    winProbability: Number(r.win_probability),
    closeDate: r.close_date ? r.close_date.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class PostgresOpportunityStore implements OpportunityStore {
  constructor(private readonly pool: Pool) {}

  async create(o: Opportunity): Promise<void> {
    await this.insert(this.pool, o);
  }

  async createWithClient(tx: TxHandle | null, o: Opportunity): Promise<void> {
    if (tx === null) return this.create(o);
    await this.insert(tx as PoolClient, o);
  }

  async update(o: Opportunity): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_crm_opportunities
          SET title = $2, value = $3, stage = $4, win_probability = $5, close_date = $6, updated_at = now()
        WHERE id = $1`,
      [o.id, o.title, o.value, o.stage, o.winProbability, o.closeDate],
    );
  }

  private insert(executor: Pool | PoolClient, o: Opportunity): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_opportunities (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        o.id,
        o.tenantId,
        o.companyId,
        o.leadId,
        o.title,
        o.value,
        o.stage,
        o.winProbability,
        o.closeDate,
        o.createdAt,
        o.updatedAt,
      ],
    );
  }

  async get(id: Id): Promise<Opportunity | null> {
    const res = await this.pool.query<OppRow>(
      `SELECT ${COLS} FROM public.aura_crm_opportunities WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToOpportunity(res.rows[0]) : null;
  }

  async list(filter: OpportunityFilter = {}): Promise<Opportunity[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.stage) {
      params.push(filter.stage);
      where.push(`stage = $${params.length}`);
    }
    if (filter.leadId) {
      params.push(filter.leadId);
      where.push(`lead_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<OppRow>(
      `SELECT ${COLS} FROM public.aura_crm_opportunities ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToOpportunity);
  }
}
