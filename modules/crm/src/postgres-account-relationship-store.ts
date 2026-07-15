import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { AccountRelationship } from './domain/account-relationship';
import type { AccountRelationshipStore } from './account-relationship-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  from_account_id: string;
  to_account_id: string;
  relationship_type: string;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, from_account_id, to_account_id, relationship_type, notes, created_by, created_at';

function rowToRel(r: Row): AccountRelationship {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    fromAccountId: r.from_account_id,
    toAccountId: r.to_account_id,
    type: r.relationship_type as AccountRelationship['type'],
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable relationship graph on Postgres (`aura_crm_account_relationships`). */
export class PostgresAccountRelationshipStore implements AccountRelationshipStore {
  constructor(private readonly pool: Pool) {}

  async create(rel: AccountRelationship): Promise<void> {
    await this.insert(this.pool, rel);
  }

  async createWithClient(tx: TxHandle | null, rel: AccountRelationship): Promise<void> {
    if (tx === null) return this.create(rel);
    await this.insert(tx as PoolClient, rel);
  }

  private insert(executor: Pool | PoolClient, rel: AccountRelationship): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_account_relationships (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [rel.id, rel.tenantId, rel.companyId, rel.fromAccountId, rel.toAccountId, rel.type, rel.notes, rel.createdBy, rel.createdAt],
    );
  }

  async get(id: Id): Promise<AccountRelationship | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_account_relationships WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToRel(res.rows[0]) : null;
  }

  async delete(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_crm_account_relationships WHERE id = $1`, [id]);
  }

  async deleteWithClient(tx: TxHandle | null, id: Id): Promise<void> {
    if (tx === null) return this.delete(id);
    await (tx as PoolClient).query(`DELETE FROM public.aura_crm_account_relationships WHERE id = $1`, [id]);
  }

  async listFor(tenantId: Id, accountId: Id): Promise<AccountRelationship[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_account_relationships
       WHERE tenant_id = $1 AND (from_account_id = $2 OR to_account_id = $2)
       ORDER BY created_at DESC`,
      [tenantId, accountId],
    );
    return res.rows.map(rowToRel);
  }

  async find(tenantId: Id, fromAccountId: Id, toAccountId: Id, type: string): Promise<AccountRelationship | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_account_relationships
       WHERE tenant_id = $1 AND from_account_id = $2 AND to_account_id = $3 AND relationship_type = $4`,
      [tenantId, fromAccountId, toAccountId, type],
    );
    return res.rows.length ? rowToRel(res.rows[0]) : null;
  }
}
