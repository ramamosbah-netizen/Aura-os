import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface Snapshot<T = any> {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  state: T;
  createdAt: Date;
}

@Injectable()
export class SnapshotEngine {
  private readonly logger = new Logger('SnapshotEngine');

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async getLatestSnapshot<T = any>(
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    txClient?: PoolClient
  ): Promise<Snapshot<T> | null> {
    if (!this.pool) return null;
    const client = txClient ?? this.pool;

    const { rows } = await client.query<{
      tenant_id: string;
      aggregate_type: string;
      aggregate_id: string;
      version: number;
      state: any;
      created_at: Date;
    }>(
      `SELECT tenant_id, aggregate_type, aggregate_id, version, state, created_at
         FROM public.aura_snapshots
        WHERE tenant_id = $1 AND aggregate_type = $2 AND aggregate_id = $3`,
      [tenantId, aggregateType, aggregateId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      tenantId: r.tenant_id,
      aggregateType: r.aggregate_type,
      aggregateId: r.aggregate_id,
      version: r.version,
      state: r.state,
      createdAt: r.created_at,
    };
  }

  async saveSnapshot<T = any>(
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    version: number,
    state: T,
    txClient?: PoolClient
  ): Promise<void> {
    if (!this.pool) return;
    const client = txClient ?? this.pool;

    await client.query(
      `INSERT INTO public.aura_snapshots (tenant_id, aggregate_type, aggregate_id, version, state, created_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id, aggregate_type, aggregate_id)
       DO UPDATE SET version = EXCLUDED.version, state = EXCLUDED.state, created_at = now()`,
      [tenantId, aggregateType, aggregateId, version, JSON.stringify(state)]
    );
    this.logger.log(`Snapshot saved for ${aggregateType}:${aggregateId} at version ${version}`);
  }
}
