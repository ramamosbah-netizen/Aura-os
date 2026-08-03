import type { Pool } from 'pg';
import type { CostTransaction, CostTxnSource, CostTxnType } from './domain/cost-transaction';
import type { CostLedgerFilter, CostLedgerStore } from './cost-ledger-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string;
  cbs_node_id: string | null; wbs_node_id: string | null; type: string; amount: string;
  quantity: string | null; source: string; source_ref: string | null;
  dimensions: Record<string, string> | null; occurred_at: string; created_at: string; created_by: string | null;
}

const COLS = `id, tenant_id, company_id, project_id, cbs_node_id, wbs_node_id, type, amount, quantity,
  source, source_ref, dimensions, occurred_at::text, created_at::text, created_by`;

function toTxn(r: Row): CostTransaction {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    cbsNodeId: r.cbs_node_id, wbsNodeId: r.wbs_node_id, type: r.type as CostTxnType, amount: Number(r.amount),
    quantity: r.quantity != null ? Number(r.quantity) : null, source: r.source as CostTxnSource,
    sourceRef: r.source_ref, dimensions: r.dimensions ?? null,
    occurredAt: r.occurred_at, createdAt: r.created_at, createdBy: r.created_by,
  };
}

export class PostgresCostLedgerStore implements CostLedgerStore {
  constructor(private readonly pool: Pool) {}

  async append(t: CostTransaction): Promise<void> {
    await this.pool.query(
      `insert into public.aura_projects_cost_ledger
        (id, tenant_id, company_id, project_id, cbs_node_id, wbs_node_id, type, amount, quantity, source, source_ref, dimensions, occurred_at, created_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [t.id, t.tenantId, t.companyId, t.projectId, t.cbsNodeId, t.wbsNodeId, t.type, t.amount, t.quantity,
       t.source, t.sourceRef, t.dimensions ? JSON.stringify(t.dimensions) : null, t.occurredAt, t.createdAt, t.createdBy],
    );
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
