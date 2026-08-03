import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { IpcLine } from './domain/ipc-line';
import type { IpcLineStore } from './ipc-line-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; certificate_id: string;
  project_id: string; boq_item_id: string; description: string;
  quantity: string | number; unit: string; rate: string | number; amount: string | number; created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, certificate_id, project_id, boq_item_id, description, quantity, unit, rate, amount, created_at';

function toLine(r: Row): IpcLine {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, certificateId: r.certificate_id,
    projectId: r.project_id, boqItemId: r.boq_item_id, description: r.description,
    quantity: Number(r.quantity), unit: r.unit, rate: Number(r.rate), amount: Number(r.amount),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresIpcLineStore implements IpcLineStore {
  constructor(private readonly pool: Pool) {}

  async add(line: IpcLine): Promise<void> {
    await this.insert(this.pool, line);
  }

  async addWithClient(tx: TxHandle | null, line: IpcLine): Promise<void> {
    if (tx === null) return this.add(line);
    await this.insert(tx as PoolClient, line);
  }

  private insert(executor: Pool | PoolClient, l: IpcLine): Promise<unknown> {
    return executor.query(
      `insert into public.aura_contracts_ipc_lines (${COLS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [l.id, l.tenantId, l.companyId, l.certificateId, l.projectId, l.boqItemId, l.description, l.quantity, l.unit, l.rate, l.amount, l.createdAt],
    );
  }

  async listByCertificate(certificateId: Id, tenantId: Id): Promise<IpcLine[]> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_contracts_ipc_lines where certificate_id = $1 and tenant_id = $2 order by created_at asc`,
      [certificateId, tenantId],
    );
    return res.rows.map(toLine);
  }
}
