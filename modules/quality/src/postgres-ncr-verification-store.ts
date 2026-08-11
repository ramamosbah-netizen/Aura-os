import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { NcrVerification } from './domain/ncr-verification';
import type { NcrVerificationStore } from './store.interface';

export class PostgresNcrVerificationStore implements NcrVerificationStore {
  constructor(private readonly pool: Pool) {}

  async save(v: NcrVerification, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_ncr_verifications (
        id, tenant_id, company_id, ncr_id, ncr_number, project_id, verified_by, verified_at, outcome, note
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.id, v.tenantId, v.companyId, v.ncrId, v.ncrNumber, v.projectId, v.verifiedBy, v.verifiedAt, v.outcome, v.note],
    );
  }

  async listByNcr(ncrId: string, tenantId: string): Promise<NcrVerification[]> {
    const res = await this.pool.query(
      `select * from public.aura_quality_ncr_verifications where ncr_id = $1 and tenant_id = $2 order by verified_at desc`,
      [ncrId, tenantId],
    );
    return res.rows.map(this.map);
  }

  private map(row: QueryResultRow): NcrVerification {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      ncrId: row.ncr_id,
      ncrNumber: row.ncr_number,
      projectId: row.project_id,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at instanceof Date ? row.verified_at.toISOString() : String(row.verified_at),
      outcome: row.outcome,
      note: row.note,
    };
  }
}
