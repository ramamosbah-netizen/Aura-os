import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ContractBond } from './domain/contract-bond';
import type { BondFilter, BondStore } from './bond-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  contract_id: string;
  kind: string;
  reference: string;
  bank: string | null;
  amount: string | number;
  issue_date: string | Date | null;
  expiry_date: string | Date | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, contract_id, kind, reference, bank, amount, issue_date, expiry_date, status, notes, created_by, created_at';

const d10 = (v: string | Date | null): string | null => (v === null ? null : String(v instanceof Date ? v.toISOString() : v).slice(0, 10));

function rowToBond(r: Row): ContractBond {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    contractId: r.contract_id,
    kind: r.kind as ContractBond['kind'],
    reference: r.reference,
    bank: r.bank,
    amount: Number(r.amount),
    issueDate: d10(r.issue_date),
    expiryDate: d10(r.expiry_date),
    status: r.status as ContractBond['status'],
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable bonds/guarantees on Postgres (`aura_contract_bonds`). */
export class PostgresBondStore implements BondStore {
  constructor(private readonly pool: Pool) {}

  async save(b: ContractBond): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_contract_bonds (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, expiry_date = EXCLUDED.expiry_date`,
      [b.id, b.tenantId, b.companyId, b.contractId, b.kind, b.reference, b.bank, b.amount, b.issueDate, b.expiryDate, b.status, b.notes, b.createdBy, b.createdAt],
    );
  }

  async get(id: Id): Promise<ContractBond | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contract_bonds WHERE id = $1`, [id]);
    return res.rows.length ? rowToBond(res.rows[0]) : null;
  }

  async list(filter: BondFilter = {}): Promise<ContractBond[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, v: unknown): void => {
      if (v === undefined || v === '') return;
      params.push(v);
      where.push(`${col} = $${params.length}`);
    };
    add('tenant_id', filter.tenantId);
    add('contract_id', filter.contractId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contract_bonds ${whereSql} ORDER BY created_at DESC`, params);
    return res.rows.map(rowToBond);
  }
}
