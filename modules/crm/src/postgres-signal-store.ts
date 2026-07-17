import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams, Signal, SignalSource, SignalStatus, SignalType } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { SignalFilter, SignalStore } from './signal-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  source: string;
  type: string;
  account_id: string | null;
  account_name: string | null;
  contact_id: string | null;
  context_type: string | null;
  context_id: string | null;
  evidence: string | null;
  confidence: number;
  detected_at: Date;
  owner_id: string | null;
  status: string;
  promoted_lead_id: string | null;
  dismissal_reason: string | null;
  dedupe_key: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  'id, tenant_id, company_id, title, description, source, type, account_id, account_name, contact_id, ' +
  'context_type, context_id, evidence, confidence, detected_at, owner_id, status, promoted_lead_id, ' +
  'dismissal_reason, dedupe_key, created_at, updated_at';

function rowToSignal(r: Row): Signal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    description: r.description,
    source: r.source as SignalSource,
    type: r.type as SignalType,
    accountId: r.account_id,
    accountName: r.account_name,
    contactId: r.contact_id,
    contextType: r.context_type,
    contextId: r.context_id,
    evidence: r.evidence,
    confidence: r.confidence,
    detectedAt: r.detected_at.toISOString(),
    ownerId: r.owner_id,
    status: r.status as SignalStatus,
    promotedLeadId: r.promoted_lead_id,
    dismissalReason: r.dismissal_reason,
    dedupeKey: r.dedupe_key,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

const VALUES = '($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)';
const params = (s: Signal): unknown[] => [
  s.id, s.tenantId, s.companyId, s.title, s.description, s.source, s.type, s.accountId, s.accountName,
  s.contactId, s.contextType, s.contextId, s.evidence, s.confidence, s.detectedAt, s.ownerId, s.status,
  s.promotedLeadId, s.dismissalReason, s.dedupeKey, s.createdAt, s.updatedAt,
];

export class PostgresSignalStore implements SignalStore {
  constructor(private readonly pool: Pool) {}

  async create(s: Signal): Promise<void> {
    await this.insert(this.pool, s);
  }
  async createWithClient(tx: TxHandle | null, s: Signal): Promise<void> {
    if (tx === null) return this.create(s);
    await this.insert(tx as PoolClient, s);
  }
  private insert(executor: Pool | PoolClient, s: Signal): Promise<unknown> {
    return executor.query(`INSERT INTO public.aura_crm_signals (${COLS}) VALUES ${VALUES}`, params(s));
  }

  async update(s: Signal): Promise<void> {
    await this.updateWith(this.pool, s);
  }
  async updateWithClient(tx: TxHandle | null, s: Signal): Promise<void> {
    if (tx === null) return this.update(s);
    await this.updateWith(tx as PoolClient, s);
  }
  private updateWith(executor: Pool | PoolClient, s: Signal): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_crm_signals SET
         title = $4, description = $5, source = $6, type = $7, account_id = $8, account_name = $9,
         contact_id = $10, context_type = $11, context_id = $12, evidence = $13, confidence = $14,
         detected_at = $15, owner_id = $16, status = $17, promoted_lead_id = $18,
         dismissal_reason = $19, dedupe_key = $20, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND company_id IS NOT DISTINCT FROM $3`,
      params(s).slice(0, 20),
    );
  }

  async get(id: Id): Promise<Signal | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_signals WHERE id = $1`, [id]);
    return res.rows.length ? rowToSignal(res.rows[0]) : null;
  }

  private buildWhere(filter: SignalFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { p.push(val); where.push(`${col} = $${p.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('source', filter.source);
    add('account_id', filter.accountId);
    add('dedupe_key', filter.dedupeKey);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params: p };
  }

  async list(filter: SignalFilter = {}): Promise<Signal[]> {
    const { whereSql, params: p } = this.buildWhere(filter);
    p.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals ${whereSql} ORDER BY detected_at DESC LIMIT $${p.length}`, p);
    return res.rows.map(rowToSignal);
  }

  async listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>> {
    const { whereSql, params: p } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_signals ${whereSql}`, p);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...p, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals ${whereSql} ORDER BY detected_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToSignal), total, page);
  }
}
