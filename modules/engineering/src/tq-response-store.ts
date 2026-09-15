import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TqResponseRevision } from './domain/technical-query';

/**
 * Where a SUPERSEDED technical-query answer is kept.
 *
 * Append-only by design and by grant (migration 0329 grants SELECT and INSERT and nothing else): a
 * design decision that stood, and that site may have built to, is a thing that happened. A record
 * of it that could be edited afterwards is not a record of anything.
 *
 * Only superseded answers land here. The CURRENT answer lives on the query itself, so this table
 * holds exactly the history that would otherwise have been destroyed by the overwrite.
 */
export const TQ_RESPONSE_STORE = Symbol('TQ_RESPONSE_STORE');

export interface RecordedTqResponse extends TqResponseRevision {
  tenantId: Id;
  projectId: Id;
  technicalQueryId: Id;
}

export interface TqResponseStore {
  record(tx: TxHandle | null, revision: RecordedTqResponse): Promise<void>;
  /** Every superseded answer for a query, oldest first. */
  listForQuery(tenantId: Id, technicalQueryId: Id): Promise<RecordedTqResponse[]>;
}

/** In-memory, for a composition with no database. Same contract, same append-only behaviour. */
export class InMemoryTqResponseStore implements TqResponseStore {
  private readonly rows: RecordedTqResponse[] = [];

  async record(_tx: TxHandle | null, revision: RecordedTqResponse): Promise<void> {
    this.rows.push({ ...revision });
  }

  async listForQuery(tenantId: Id, technicalQueryId: Id): Promise<RecordedTqResponse[]> {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.technicalQueryId === technicalQueryId)
      .sort((a, b) => a.revision - b.revision)
      .map((row) => ({ ...row }));
  }
}

interface Row {
  tenant_id: string; project_id: string; technical_query_id: string;
  revision: number; response: string; responded_at: Date | string;
  responded_by: string | null; superseded_reason: string;
}

export class PostgresTqResponseStore implements TqResponseStore {
  constructor(private readonly pool: Pool) {}

  async record(tx: TxHandle | null, revision: RecordedTqResponse): Promise<void> {
    const executor = (tx as PoolClient | null) ?? this.pool;
    await executor.query(
      `INSERT INTO public.aura_engineering_tq_responses
         (id, tenant_id, project_id, technical_query_id, revision, response, responded_at, responded_by, superseded_reason)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (technical_query_id, revision) DO NOTHING`,
      [revision.tenantId, revision.projectId, revision.technicalQueryId, revision.revision,
       revision.response, revision.respondedAt, revision.respondedBy, revision.supersededReason],
    );
  }

  async listForQuery(tenantId: Id, technicalQueryId: Id): Promise<RecordedTqResponse[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT tenant_id, project_id, technical_query_id, revision, response, responded_at, responded_by, superseded_reason
         FROM public.aura_engineering_tq_responses
        WHERE tenant_id = $1 AND technical_query_id = $2
        ORDER BY revision`,
      [tenantId, technicalQueryId],
    );
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      projectId: row.project_id,
      technicalQueryId: row.technical_query_id,
      revision: Number(row.revision),
      response: row.response,
      respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : String(row.responded_at),
      respondedBy: row.responded_by,
      supersededReason: row.superseded_reason,
    }));
  }
}
