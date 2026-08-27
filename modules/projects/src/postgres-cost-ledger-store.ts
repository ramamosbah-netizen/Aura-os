import type { Pool } from 'pg';
import type { CostTransaction, CostTxnSource, CostTxnType } from './domain/cost-transaction';
import type { AppendResult, CostLedgerFilter, CostLedgerStore } from './cost-ledger-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string;
  cbs_node_id: string | null; wbs_node_id: string | null; type: string; amount: string;
  quantity: string | null; source: string; source_ref: string | null;
  dimensions: Record<string, string> | null; dedupe_key: string | null;
  occurred_at: string; created_at: string; created_by: string | null;
}

const COLS = `id, tenant_id, company_id, project_id, cbs_node_id, wbs_node_id, type, amount, quantity,
  source, source_ref, dimensions, dedupe_key, occurred_at::text, created_at::text, created_by`;

function toTxn(r: Row): CostTransaction {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    cbsNodeId: r.cbs_node_id, wbsNodeId: r.wbs_node_id, type: r.type as CostTxnType, amount: Number(r.amount),
    quantity: r.quantity != null ? Number(r.quantity) : null, source: r.source as CostTxnSource,
    sourceRef: r.source_ref, dimensions: r.dimensions ?? null, dedupeKey: r.dedupe_key ?? null,
    occurredAt: r.occurred_at, createdAt: r.created_at, createdBy: r.created_by,
  };
}

export class PostgresCostLedgerStore implements CostLedgerStore {
  constructor(private readonly pool: Pool) {}

  async append(t: CostTransaction): Promise<AppendResult> {
    // With a dedupe key, a replay of the same post conflicts on the partial unique index and writes
    // nothing (DO NOTHING → 0 rows returned); we then read back the transaction already on file so
    // the caller can tell it apart from a fresh insert and skip moving the CBS balance a second time.
    const inserted = await this.pool.query<Row>(
      `insert into public.aura_projects_cost_ledger
        (id, tenant_id, company_id, project_id, cbs_node_id, wbs_node_id, type, amount, quantity, source, source_ref, dimensions, dedupe_key, occurred_at, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
       returning ${COLS}`,
      [t.id, t.tenantId, t.companyId, t.projectId, t.cbsNodeId, t.wbsNodeId, t.type, t.amount, t.quantity,
       t.source, t.sourceRef, t.dimensions ? JSON.stringify(t.dimensions) : null, t.dedupeKey, t.occurredAt, t.createdAt, t.createdBy],
    );
    if (inserted.rows.length > 0) return { txn: toTxn(inserted.rows[0]), inserted: true };
    // Conflict on the dedupe key — return the transaction already stored for this (tenant, key).
    const existing = await this.pool.query<Row>(
      `select ${COLS} from public.aura_projects_cost_ledger where tenant_id = $1 and dedupe_key = $2 limit 1`,
      [t.tenantId, t.dedupeKey],
    );
    return { txn: toTxn(existing.rows[0]), inserted: false };
  }

  async list(filter: CostLedgerFilter): Promise<CostTransaction[]> {
    const where: string[] = ['tenant_id = $1'];
    const params: unknown[] = [filter.tenantId];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.cbsNodeId) { params.push(filter.cbsNodeId); where.push(`cbs_node_id = $${params.length}`); }
    params.push(filter.limit ?? 500);
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_projects_cost_ledger where ${where.join(' and ')} order by occurred_at desc limit $${params.length}`,
      params,
    );
    return res.rows.map(toTxn);
  }
}
