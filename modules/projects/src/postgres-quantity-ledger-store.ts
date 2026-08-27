import type { Pool } from 'pg';
import type { QuantityTransaction, QtyTxnSource, QtyTxnType } from './domain/quantity-transaction';
import type { QuantityAppendResult, QuantityLedgerFilter, QuantityLedgerStore } from './quantity-ledger-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string;
  boq_item_id: string; cbs_node_id: string | null; type: string; quantity: string;
  unit: string | null; source: string; source_ref: string | null;
  dimensions: Record<string, string> | null; dedupe_key: string | null;
  occurred_at: string; created_at: string; created_by: string | null;
}

const COLS = `id, tenant_id, company_id, project_id, boq_item_id, cbs_node_id, type, quantity, unit,
  source, source_ref, dimensions, dedupe_key, occurred_at::text, created_at::text, created_by`;

function toTxn(r: Row): QuantityTransaction {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    boqItemId: r.boq_item_id, cbsNodeId: r.cbs_node_id, type: r.type as QtyTxnType, quantity: Number(r.quantity),
    unit: r.unit, source: r.source as QtyTxnSource,
    sourceRef: r.source_ref, dimensions: r.dimensions ?? null, dedupeKey: r.dedupe_key ?? null,
    occurredAt: r.occurred_at, createdAt: r.created_at, createdBy: r.created_by,
  };
}

export class PostgresQuantityLedgerStore implements QuantityLedgerStore {
  constructor(private readonly pool: Pool) {}

  async append(t: QuantityTransaction): Promise<QuantityAppendResult> {
    // A keyed replay conflicts on the partial unique index and writes nothing; we read back the row
    // already on file so the caller can tell a fresh insert from a dedupe hit.
    const inserted = await this.pool.query<Row>(
      `insert into public.aura_projects_quantity_ledger
        (id, tenant_id, company_id, project_id, boq_item_id, cbs_node_id, type, quantity, unit, source, source_ref, dimensions, dedupe_key, occurred_at, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
       returning ${COLS}`,
      [t.id, t.tenantId, t.companyId, t.projectId, t.boqItemId, t.cbsNodeId, t.type, t.quantity, t.unit,
       t.source, t.sourceRef, t.dimensions ? JSON.stringify(t.dimensions) : null, t.dedupeKey, t.occurredAt, t.createdAt, t.createdBy],
    );
    if (inserted.rows.length > 0) return { txn: toTxn(inserted.rows[0]), inserted: true };
    const existing = await this.pool.query<Row>(
      `select ${COLS} from public.aura_projects_quantity_ledger where tenant_id = $1 and dedupe_key = $2 limit 1`,
      [t.tenantId, t.dedupeKey],
    );
    return { txn: toTxn(existing.rows[0]), inserted: false };
  }

  async list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]> {
    const where: string[] = ['tenant_id = $1'];
    const params: unknown[] = [filter.tenantId];
    if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
    if (filter.boqItemId) { params.push(filter.boqItemId); where.push(`boq_item_id = $${params.length}`); }
    params.push(filter.limit ?? 500);
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_projects_quantity_ledger where ${where.join(' and ')} order by occurred_at desc limit $${params.length}`,
      params,
    );
    return res.rows.map(toTxn);
  }
}
