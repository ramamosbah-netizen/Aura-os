import type { Pool, PoolClient } from 'pg';
import type { Id, Lead, LeadStatus, LeadSource, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { LeadFilter, LeadStore } from './lead-store';

interface LeadRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  assigned_to: string | null;
  assigned_at: Date | null;
  first_responded_at: Date | null;
  sla_first_response_hours: number | null;
  next_activity_due: string | null;
  converted_opportunity_id: string | null;
  converted_at: Date | null;
  signal_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  'id, tenant_id, company_id, name, company_name, email, phone, status, source, ' +
  'assigned_to, assigned_at, first_responded_at, sla_first_response_hours, next_activity_due, ' +
  'converted_opportunity_id, converted_at, signal_id, created_at, updated_at';

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    companyName: r.company_name,
    email: r.email,
    phone: r.phone,
    status: r.status as LeadStatus,
    source: r.source as LeadSource | null,
    assignedTo: r.assigned_to,
    assignedAt: r.assigned_at ? r.assigned_at.toISOString() : null,
    firstRespondedAt: r.first_responded_at ? r.first_responded_at.toISOString() : null,
    slaFirstResponseHours: r.sla_first_response_hours,
    nextActivityDue: r.next_activity_due,
    convertedOpportunityId: r.converted_opportunity_id,
    convertedAt: r.converted_at ? r.converted_at.toISOString() : null,
    signalId: r.signal_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class PostgresLeadStore implements LeadStore {
  constructor(private readonly pool: Pool) {}

  async create(l: Lead): Promise<void> {
    await this.insert(this.pool, l);
  }

  async createWithClient(tx: TxHandle | null, l: Lead): Promise<void> {
    if (tx === null) return this.create(l);
    await this.insert(tx as PoolClient, l);
  }

  async update(l: Lead): Promise<void> {
    await this.updateWith(this.pool, l);
  }

  async updateWithClient(tx: TxHandle | null, l: Lead): Promise<void> {
    if (tx === null) return this.update(l);
    await this.updateWith(tx as PoolClient, l);
  }

  private updateWith(executor: Pool | PoolClient, l: Lead): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_crm_leads
          SET name = $2, company_name = $3, email = $4, phone = $5, status = $6, source = $7,
              assigned_to = $8, assigned_at = $9, first_responded_at = $10,
              sla_first_response_hours = $11, next_activity_due = $12,
              converted_opportunity_id = $13, converted_at = $14, signal_id = $15, updated_at = now()
        WHERE id = $1`,
      [l.id, l.name, l.companyName, l.email, l.phone, l.status, l.source,
       l.assignedTo, l.assignedAt, l.firstRespondedAt, l.slaFirstResponseHours, l.nextActivityDue,
       l.convertedOpportunityId, l.convertedAt, l.signalId],
    );
  }

  private insert(executor: Pool | PoolClient, l: Lead): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_leads (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [l.id, l.tenantId, l.companyId, l.name, l.companyName, l.email, l.phone, l.status, l.source,
       l.assignedTo, l.assignedAt, l.firstRespondedAt, l.slaFirstResponseHours, l.nextActivityDue,
       l.convertedOpportunityId, l.convertedAt, l.signalId, l.createdAt, l.updatedAt],
    );
  }

  async get(id: Id): Promise<Lead | null> {
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToLead(res.rows[0]) : null;
  }

  private buildWhere(filter: LeadFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: LeadFilter = {}): Promise<Lead[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToLead);
  }
  async listPaged(filter: LeadFilter, page: PageParams): Promise<Page<Lead>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_leads ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToLead), total, page);
  }
}
