import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Tender } from './domain/tender';
import type { TenderFilter, TenderStore } from './tender-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  reference: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, title, reference, account_id, account_name, status, value, owner_id, created_by, created_at';

function rowToTender(r: Row): Tender {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    reference: r.reference,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status as Tender['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable tenders on Postgres (`aura_tendering_tenders`). */
export class PostgresTenderStore implements TenderStore {
  constructor(private readonly pool: Pool) {}

  async create(t: Tender): Promise<void> {
    await this.insert(this.pool, t);
  }

  async createWithClient(tx: TxHandle | null, t: Tender): Promise<void> {
    if (tx === null) return this.create(t);
    await this.insert(tx as PoolClient, t);
  }

  private insert(executor: Pool | PoolClient, t: Tender): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_tendering_tenders (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [t.id, t.tenantId, t.companyId, t.title, t.reference, t.accountId, t.accountName, t.status, t.value, t.ownerId, t.createdBy, t.createdAt],
    );
  }

  async update(t: Tender): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_tendering_tenders SET title=$2, reference=$3, account_id=$4, account_name=$5, status=$6, value=$7, owner_id=$8 WHERE id=$1`,
      [t.id, t.title, t.reference, t.accountId, t.accountName, t.status, t.value, t.ownerId],
    );
  }

  async get(id: Id): Promise<Tender | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_tenders WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToTender(res.rows[0]) : null;
  }

  async list(filter: TenderFilter = {}): Promise<Tender[]> {
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
    add('account_id', filter.accountId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_tenders ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToTender);
  }
}
