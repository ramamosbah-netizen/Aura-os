import type { Pool } from 'pg';
import type { QuantityTransaction, QtyTxnSource, QtyTxnType } from './domain/quantity-transaction';
import type { QuantityLedgerFilter, QuantityLedgerStore } from './quantity-ledger-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string;
  boq_item_id: string; cbs_node_id: string | null; type: string; quantity: string;
  unit: string | null; source: string; source_ref: string | null;
  dimensions: Record<string, string> | null; occurred_at: string; created_at: string; created_by: string | null;
}

const COLS = `id, tenant_id, company_id, project_id, boq_item_id, cbs_node_id, type, quantity, unit,
  source, source_ref, dimensions, occurred_at::text, created_at::text, created_by`;

function toTxn(r: Row): QuantityTransaction {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    boqItemId: r.boq_item_id, cbsNodeId: r.cbs_node_id, type: r.type as QtyTxnType, quantity: Number(r.quantity),
    unit: r.unit, source: r.source as QtyTxnSource,
    sourceRef: r.source_ref, dimensions: r.dimensions ?? null,
    occurredAt: r.occurred_at, createdAt: r.created_at, createdBy: r.created_by,
  };
}

export class PostgresQuantityLedgerStore implements QuantityLedgerStore {
  constructor(private readonly pool: Pool) {}

  async append(t: QuantityTransaction): Promise<void> {
    await this.pool.query(
      `insert into public.aura_projects_quantity_ledger
        (id, tenant_id, company_id, project_id, boq_item_id, cbs_node_id, type, quantity, unit, source, source_ref, dimensions, occurred_at, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [t.id, t.tenantId, t.companyId, t.projectId, t.boqItemId, t.cbsNodeId, t.type, t.quantity, t.unit,
       t.source, t.sourceRef, t.dimensions ? JSON.stringify(t.dimensions) : null, t.occurredAt, t.createdAt, t.createdBy],
    );
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
