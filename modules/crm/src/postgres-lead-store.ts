import type { Pool, PoolClient } from 'pg';
import type { Id, Lead, LeadStatus, LeadSource } from '@aura/shared';
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
  created_at: Date;
  updated_at: Date;
}

const COLS = 'id, tenant_id, company_id, name, company_name, email, phone, status, source, created_at, updated_at';

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
    await this.pool.query(
      `UPDATE public.aura_crm_leads
          SET name = $2, company_name = $3, email = $4, phone = $5, status = $6, source = $7, updated_at = now()
        WHERE id = $1`,
      [l.id, l.name, l.companyName, l.email, l.phone, l.status, l.source],
    );
  }

  private insert(executor: Pool | PoolClient, l: Lead): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_leads (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [l.id, l.tenantId, l.companyId, l.name, l.companyName, l.email, l.phone, l.status, l.source, l.createdAt, l.updatedAt],
    );
  }

  async get(id: Id): Promise<Lead | null> {
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToLead(res.rows[0]) : null;
  }

  async list(filter: LeadFilter = {}): Promise<Lead[]> {
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
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToLead);
  }
}
