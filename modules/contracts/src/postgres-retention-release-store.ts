import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { RetentionRelease } from './domain/retention-release';
import type { RetentionReleaseFilter, RetentionReleaseStore } from './retention-release-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  contract_id: string;
  contract_title: string | null;
  account_id: string | null;
  account_name: string | null;
  sequence: number | string;
  reference: string;
  kind: string;
  amount: string | number;
  release_date: string | Date | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
  approved_by: string | null;
  approved_at: Date | string | null;
}

const COLS =
  'id, tenant_id, company_id, contract_id, contract_title, account_id, account_name, sequence, reference, kind, ' +
  'amount, release_date, status, notes, created_by, created_at, approved_by, approved_at';

const d10 = (v: string | Date | null): string | null =>
  v === null ? null : String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
const iso = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString() : String(v);

function rowToRelease(r: Row): RetentionRelease {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    contractId: r.contract_id,
    contractTitle: r.contract_title,
    accountId: r.account_id,
    accountName: r.account_name,
    sequence: Number(r.sequence),
    reference: r.reference,
    kind: r.kind as RetentionRelease['kind'],
    amount: Number(r.amount),
    releaseDate: d10(r.release_date),
    status: r.status as RetentionRelease['status'],
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    approvedBy: r.approved_by,
    approvedAt: iso(r.approved_at),
  };
}

/** Durable retention releases on Postgres (`aura_contract_retention_releases`). */
export class PostgresRetentionReleaseStore implements RetentionReleaseStore {
  constructor(private readonly pool: Pool) {}

  async save(r: RetentionRelease): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_contract_retention_releases (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, amount = EXCLUDED.amount,
         release_date = EXCLUDED.release_date, notes = EXCLUDED.notes,
         approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at`,
      [
        r.id, r.tenantId, r.companyId, r.contractId, r.contractTitle, r.accountId, r.accountName, r.sequence,
        r.reference, r.kind, r.amount, r.releaseDate, r.status, r.notes, r.createdBy, r.createdAt,
        r.approvedBy, r.approvedAt,
      ],
    );
  }

  async get(id: Id): Promise<RetentionRelease | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contract_retention_releases WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToRelease(res.rows[0]) : null;
  }

  async list(filter: RetentionReleaseFilter = {}): Promise<RetentionRelease[]> {
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
    const limitSql = filter.limit ? ` LIMIT ${Number(filter.limit)}` : '';
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contract_retention_releases ${whereSql} ORDER BY sequence ASC${limitSql}`,
      params,
    );
    return res.rows.map(rowToRelease);
  }
}
