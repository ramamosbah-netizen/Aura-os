import type { Pool, PoolClient } from 'pg';
import type { Id, Opportunity, OpportunityStage, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { OpportunityFilter, OpportunityStore } from './opportunity-store';

interface OppRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  lead_id: string | null;
  account_id: string | null;
  account_name: string | null;
  title: string;
  value: string;
  stage: string;
  win_probability: string;
  close_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = 'id, tenant_id, company_id, lead_id, account_id, account_name, title, value, stage, win_probability, close_date, created_at, updated_at';

function rowToOpportunity(r: OppRow): Opportunity {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    leadId: r.lead_id,
    accountId: r.account_id,
    accountName: r.account_name,
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
          SET title = $2, value = $3, stage = $4, win_probability = $5, close_date = $6,
              account_id = $7, account_name = $8, updated_at = now()
        WHERE id = $1`,
      [o.id, o.title, o.value, o.stage, o.winProbability, o.closeDate, o.accountId, o.accountName],
    );
  }

  private insert(executor: Pool | PoolClient, o: Opportunity): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_opportunities (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        o.id,
        o.tenantId,
        o.companyId,
        o.leadId,
        o.accountId,
        o.accountName,
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

  private buildWhere(filter: OpportunityFilter): { whereSql: string; params: unknown[] } {
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
    if (filter.accountId) {
      params.push(filter.accountId);
      where.push(`account_id = $${params.length}`);
    }
    if (filter.leadId) {
      params.push(filter.leadId);
      where.push(`lead_id = $${params.length}`);
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: OpportunityFilter = {}): Promise<Opportunity[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<OppRow>(
      `SELECT ${COLS} FROM public.aura_crm_opportunities ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToOpportunity);
  }
  async listPaged(filter: OpportunityFilter, page: PageParams): Promise<Page<Opportunity>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_opportunities ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<OppRow>(
      `SELECT ${COLS} FROM public.aura_crm_opportunities ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToOpportunity), total, page);
  }
}
