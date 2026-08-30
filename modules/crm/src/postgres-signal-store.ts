import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams, Signal, SignalSource, SignalStatus, SignalType } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { SignalFilter, SignalStore, SignalSummary } from './signal-store';

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
  reviewed_by: string | null;
  reviewed_at: Date | null;
  dismissal_reason_code: string | null;
  dismissal_note: string | null;
}

const COLS =
  'id, tenant_id, company_id, title, description, source, type, account_id, account_name, contact_id, ' +
  'context_type, context_id, evidence, confidence, detected_at, owner_id, status, promoted_lead_id, ' +
  'dismissal_reason, dedupe_key, created_at, updated_at, reviewed_by, reviewed_at, dismissal_reason_code, dismissal_note';

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
    dismissalReasonCode: r.dismissal_reason_code as Signal['dismissalReasonCode'],
    dismissalNote: r.dismissal_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    dedupeKey: r.dedupe_key,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

const VALUES = '($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)';
const params = (s: Signal): unknown[] => [
  s.id, s.tenantId, s.companyId, s.title, s.description, s.source, s.type, s.accountId, s.accountName,
  s.contactId, s.contextType, s.contextId, s.evidence, s.confidence, s.detectedAt, s.ownerId, s.status,
  s.promotedLeadId, s.dismissalReason, s.dedupeKey, s.createdAt, s.updatedAt,
  s.reviewedBy, s.reviewedAt, s.dismissalReasonCode, s.dismissalNote,
];

// UPDATE does not write the immutable created_at value (and stamps updated_at in SQL), so its
// parameter list must not carry those unused placeholders. Passing the full insert list made
// PostgreSQL reject a nullable parameter whose type could not be inferred (notably during signal
// promotion), even though the corresponding value was not part of the UPDATE statement.
const updateParams = (s: Signal): unknown[] => [
  s.id, s.tenantId, s.companyId, s.title, s.description, s.source, s.type, s.accountId, s.accountName,
  s.contactId, s.contextType, s.contextId, s.evidence, s.confidence, s.detectedAt, s.ownerId, s.status,
  s.promotedLeadId, s.dismissalReason, s.dedupeKey, s.reviewedBy, s.reviewedAt,
  s.dismissalReasonCode, s.dismissalNote,
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
         dismissal_reason = $19, dedupe_key = $20, updated_at = now(),
         reviewed_by = $21, reviewed_at = $22, dismissal_reason_code = $23, dismissal_note = $24
       WHERE id = $1 AND tenant_id = $2 AND company_id IS NOT DISTINCT FROM $3`,
      updateParams(s),
    );
  }

  async get(id: Id): Promise<Signal | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_signals WHERE id = $1`, [id]);
    return res.rows.length ? rowToSignal(res.rows[0]) : null;
  }

  async getForTenant(tenantId: string, id: Id): Promise<Signal | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return res.rows.length ? rowToSignal(res.rows[0]) : null;
  }

  async getForUpdateWithClient(tx: TxHandle | null, tenantId: string, id: Id): Promise<Signal | null> {
    if (tx === null) return this.getForTenant(tenantId, id);
    const res = await (tx as PoolClient).query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, id],
    );
    return res.rows.length ? rowToSignal(res.rows[0]) : null;
  }

  private buildWhere(filter: SignalFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { p.push(val); where.push(`${col} = $${p.length}`); }
    };
    add('tenant_id', filter.tenantId);
    if (filter.statuses?.length) { p.push(filter.statuses); where.push(`status = ANY($${p.length}::text[])`); }
    else add('status', filter.status);
    add('source', filter.source);
    add('type', filter.type);
    add('owner_id', filter.ownerId);
    add('account_id', filter.accountId);
    add('context_type', filter.contextType);
    add('context_id', filter.contextId);
    add('dedupe_key', filter.dedupeKey);
    if (filter.search?.trim()) { p.push(`%${filter.search.trim()}%`); where.push(`(title ILIKE $${p.length} OR description ILIKE $${p.length} OR account_name ILIKE $${p.length} OR evidence ILIKE $${p.length})`); }
    if (filter.detectedFrom) { p.push(filter.detectedFrom); where.push(`detected_at >= $${p.length}`); }
    if (filter.detectedTo) { p.push(filter.detectedTo); where.push(`detected_at <= $${p.length}`); }
    if (filter.confidenceMin !== undefined) { p.push(filter.confidenceMin); where.push(`confidence >= $${p.length}`); }
    if (filter.confidenceMax !== undefined) { p.push(filter.confidenceMax); where.push(`confidence <= $${p.length}`); }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params: p };
  }

  private orderBy(filter: SignalFilter): string {
    const col = filter.sort === 'confidence' ? 'confidence' : filter.sort === 'title' ? 'title' : 'detected_at';
    const direction = filter.direction === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${col} ${direction}, id ${direction}`;
  }

  async list(filter: SignalFilter = {}): Promise<Signal[]> {
    const { whereSql, params: p } = this.buildWhere(filter);
    p.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals ${whereSql} ${this.orderBy(filter)} LIMIT $${p.length}`, p);
    return res.rows.map(rowToSignal);
  }

  async listPaged(filter: SignalFilter, page: PageParams): Promise<Page<Signal>> {
    const { whereSql, params: p } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_signals ${whereSql}`, p);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...p, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_signals ${whereSql} ${this.orderBy(filter)} LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToSignal), total, page);
  }

  async exportAll(filter: SignalFilter = {}): Promise<Signal[]> {
    const { whereSql, params: p } = this.buildWhere(filter);
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_signals ${whereSql} ${this.orderBy(filter)}`, p);
    return res.rows.map(rowToSignal);
  }

  async summary(filter: SignalFilter = {}): Promise<SignalSummary> {
    const { whereSql, params: p } = this.buildWhere(filter);
    const count = await this.pool.query<{
      total: string; open: string; new: string; reviewing: string; researching: string;
      promoted: string; dismissed: string; high_potential: string;
    }>(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status IN ('NEW','REVIEWING','RESEARCHING'))::int open,
      COUNT(*) FILTER (WHERE status='NEW')::int new,
      COUNT(*) FILTER (WHERE status='REVIEWING')::int reviewing,
      COUNT(*) FILTER (WHERE status='RESEARCHING')::int researching,
      COUNT(*) FILTER (WHERE status='PROMOTED')::int promoted,
      COUNT(*) FILTER (WHERE status IN ('DISMISSED','DUPLICATE'))::int dismissed,
      COUNT(*) FILTER (WHERE confidence >= 70 AND status IN ('NEW','REVIEWING','RESEARCHING'))::int high_potential
      FROM public.aura_crm_signals ${whereSql}`, p);
    const grouped = await this.pool.query<{ key: string; count: string }>(
      `SELECT source AS key, COUNT(*)::int count FROM public.aura_crm_signals ${whereSql} GROUP BY source ORDER BY count DESC`, p);
    const typed = await this.pool.query<{ key: string; count: string }>(
      `SELECT type AS key, COUNT(*)::int count FROM public.aura_crm_signals ${whereSql} GROUP BY type ORDER BY count DESC`, p);
    const r = count.rows[0];
    return { total: Number(r?.total ?? 0), open: Number(r?.open ?? 0), new: Number(r?.new ?? 0),
      reviewing: Number(r?.reviewing ?? 0), researching: Number(r?.researching ?? 0), promoted: Number(r?.promoted ?? 0),
      dismissed: Number(r?.dismissed ?? 0), highPotential: Number(r?.high_potential ?? 0),
      bySource: grouped.rows.map((x) => ({ key: x.key, count: Number(x.count) })),
      byType: typed.rows.map((x) => ({ key: x.key, count: Number(x.count) })) };
  }
}
