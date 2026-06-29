import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { BankGuarantee } from './domain/bank-guarantee';
import type { BankGuaranteeFilter, BankGuaranteeStore } from './bank-guarantee-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string;
  type: string;
  beneficiary: string;
  bank_name: string;
  project_id: string | null;
  project_name: string | null;
  amount: string | number;
  currency: string;
  issue_date: string;
  expiry_date: string;
  status: string;
  notes: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, reference, type, beneficiary, bank_name, project_id, project_name, amount, currency, ' +
  'issue_date::text AS issue_date, expiry_date::text AS expiry_date, status, notes, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): BankGuarantee {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    type: r.type as BankGuarantee['type'],
    beneficiary: r.beneficiary,
    bankName: r.bank_name,
    projectId: r.project_id,
    projectName: r.project_name,
    amount: Number(r.amount),
    currency: r.currency,
    issueDate: String(r.issue_date),
    expiryDate: String(r.expiry_date),
    status: r.status as BankGuarantee['status'],
    notes: r.notes || '',
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresBankGuaranteeStore implements BankGuaranteeStore {
  constructor(private readonly pool: Pool) {}

  async save(g: BankGuarantee): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_bank_guarantees
        (id, tenant_id, company_id, reference, type, beneficiary, bank_name, project_id, project_name, amount, currency, issue_date, expiry_date, status, notes, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes`,
      [
        g.id, g.tenantId, g.companyId, g.reference, g.type, g.beneficiary, g.bankName, g.projectId, g.projectName,
        g.amount, g.currency, g.issueDate, g.expiryDate, g.status, g.notes, g.createdBy, g.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<BankGuarantee | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_bank_guarantees WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: BankGuaranteeFilter = {}): Promise<BankGuarantee[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('project_id', filter.projectId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_bank_guarantees ${whereSql} ORDER BY expiry_date ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }
}
