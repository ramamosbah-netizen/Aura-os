import type { Pool, PoolClient } from 'pg';
import type { Id, Opportunity, OpportunityStage, Page, PageParams, BuyingStage, PursuitDecision, PursuitDimensions } from '@aura/shared';
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
  requires_tender: boolean | null;
  owner_id: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  budget_confirmed: boolean | null;
  authority_confirmed: boolean | null;
  need_confirmed: boolean | null;
  timeline_confirmed: boolean | null;
  competitors: string | null;
  source: string | null;
  loss_reason: string | null;
  buying_stage: string | null;
  pursuit_decision: string | null;
  pursuit_score: number | null;
  pursuit_rationale: string | null;
  pursuit_decided_by: string | null;
  pursuit_decided_at: Date | null;
  pursuit_dimensions: PursuitDimensions | null;
  close_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = 'id, tenant_id, company_id, lead_id, account_id, account_name, title, value, stage, win_probability, close_date, requires_tender, owner_id, next_action, next_action_due_date, budget_confirmed, authority_confirmed, need_confirmed, timeline_confirmed, competitors, source, loss_reason, buying_stage, pursuit_decision, pursuit_score, pursuit_rationale, pursuit_decided_by, pursuit_decided_at, pursuit_dimensions, created_at, updated_at';

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
    requiresTender: r.requires_tender ?? true,
    ownerId: r.owner_id,
    nextAction: r.next_action,
    nextActionDueDate: r.next_action_due_date,
    budgetConfirmed: r.budget_confirmed ?? false,
    authorityConfirmed: r.authority_confirmed ?? false,
    needConfirmed: r.need_confirmed ?? false,
    timelineConfirmed: r.timeline_confirmed ?? false,
    competitors: r.competitors,
    source: r.source,
    lossReason: r.loss_reason,
    buyingStage: (r.buying_stage as BuyingStage | null) ?? null,
    pursuitDecision: (r.pursuit_decision as PursuitDecision | null) ?? null,
    pursuitScore: r.pursuit_score,
    pursuitRationale: r.pursuit_rationale,
    pursuitDecidedBy: r.pursuit_decided_by,
    pursuitDecidedAt: r.pursuit_decided_at ? r.pursuit_decided_at.toISOString() : null,
    pursuitDimensions: r.pursuit_dimensions,
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
              account_id = $7, account_name = $8, requires_tender = $9, owner_id = $10, next_action = $11,
              budget_confirmed = $12, authority_confirmed = $13, need_confirmed = $14, timeline_confirmed = $15,
              competitors = $16, source = $17, loss_reason = $18, next_action_due_date = $19,
              buying_stage = $20, pursuit_decision = $21, pursuit_score = $22, pursuit_rationale = $23,
              pursuit_decided_by = $24, pursuit_decided_at = $25, pursuit_dimensions = $26, updated_at = now()
        WHERE id = $1`,
      [o.id, o.title, o.value, o.stage, o.winProbability, o.closeDate, o.accountId, o.accountName, o.requiresTender, o.ownerId, o.nextAction,
       o.budgetConfirmed, o.authorityConfirmed, o.needConfirmed, o.timelineConfirmed, o.competitors, o.source, o.lossReason, o.nextActionDueDate,
       o.buyingStage, o.pursuitDecision, o.pursuitScore, o.pursuitRationale, o.pursuitDecidedBy, o.pursuitDecidedAt,
       o.pursuitDimensions ? JSON.stringify(o.pursuitDimensions) : null],
    );
  }

  private insert(executor: Pool | PoolClient, o: Opportunity): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_opportunities (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
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
        o.requiresTender,
        o.ownerId,
        o.nextAction,
        o.nextActionDueDate,
        o.budgetConfirmed,
        o.authorityConfirmed,
        o.needConfirmed,
        o.timelineConfirmed,
        o.competitors,
        o.source,
        o.lossReason,
        o.buyingStage,
        o.pursuitDecision,
        o.pursuitScore,
        o.pursuitRationale,
        o.pursuitDecidedBy,
        o.pursuitDecidedAt,
        o.pursuitDimensions ? JSON.stringify(o.pursuitDimensions) : null,
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
