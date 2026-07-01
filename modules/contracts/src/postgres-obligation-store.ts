import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { ContractObligation } from './domain/contract-obligation';
import type { ObligationFilter, ObligationStore } from './obligation-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  contract_id: string;
  contract_title: string | null;
  title: string;
  description: string | null;
  obligation_type: string;
  responsible_party: string;
  due_date: Date | string;
  status: string;
  completed_date: Date | string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, contract_id, contract_title, title, description, obligation_type, responsible_party, due_date, status, completed_date, notes, created_by, created_at, updated_at';

const dateOnly = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

function rowToObligation(r: Row): ContractObligation {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    contractId: r.contract_id,
    contractTitle: r.contract_title,
    title: r.title,
    description: r.description,
    obligationType: r.obligation_type as ContractObligation['obligationType'],
    responsibleParty: r.responsible_party as ContractObligation['responsibleParty'],
    dueDate: dateOnly(r.due_date)!,
    status: r.status as ContractObligation['status'],
    completedDate: dateOnly(r.completed_date),
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresObligationStore implements ObligationStore {
  constructor(private readonly pool: Pool) {}

  async save(o: ContractObligation): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_contracts_obligations (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, obligation_type = EXCLUDED.obligation_type,
         responsible_party = EXCLUDED.responsible_party, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
         completed_date = EXCLUDED.completed_date, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
      [o.id, o.tenantId, o.companyId, o.contractId, o.contractTitle, o.title, o.description, o.obligationType, o.responsibleParty, o.dueDate, o.status, o.completedDate, o.notes, o.createdBy, o.createdAt, o.updatedAt],
    );
  }

  async get(id: Id): Promise<ContractObligation | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_obligations WHERE id = $1`, [id]);
    return res.rows.length ? rowToObligation(res.rows[0]) : null;
  }

  private buildWhere(filter: ObligationFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('contract_id', filter.contractId);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: ObligationFilter = {}): Promise<ContractObligation[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_obligations ${whereSql} ORDER BY due_date ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToObligation);
  }

  async listPaged(filter: ObligationFilter, page: PageParams): Promise<Page<ContractObligation>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_contracts_obligations ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_obligations ${whereSql} ORDER BY due_date ASC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToObligation), total, page);
  }
}
