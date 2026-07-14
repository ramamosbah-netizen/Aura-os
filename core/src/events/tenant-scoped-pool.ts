import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Wraps a pg {@link Pool} so that EVERY pooled `query()` runs with the active request's
 * tenant bound to the Postgres `app.current_tenant_id` GUC that the RLS policies read.
 *
 * Why this exists: module stores call `pool.query(...)` **directly** for reads
 * (`get`/`list`/`listPaged`) — they bypass the transaction runner, which is the only place
 * that previously set the tenant GUC. Without this wrapper, a read issued under an enforced
 * (non-BYPASSRLS) role would run with no tenant context and, thanks to RLS, return nothing.
 *
 * Guarantees:
 *  - **Fail closed:** with no bound request tenant the GUC is set to '' — `current_tenant_id()`
 *    is then NULL and the policies (`tenant_id = current_tenant_id()`) match no rows.
 *  - **No cross-request leak:** the GUC is set on the checked-out client and RESET before the
 *    client is released back to the pool, so a pooled connection never carries one request's
 *    tenant into the next.
 *  - `connect()` is passed through unchanged: the {@link PostgresTxRunner} sets a
 *    transaction-LOCAL GUC on the client it checks out, which is stricter and self-resetting.
 *
 * Structurally compatible with the subset of `Pool` the codebase uses (`query`/`connect`/`end`);
 * provided in place of the raw Pool at the `PG_POOL` seam.
 */
export class TenantScopedPool {
  constructor(
    private readonly inner: Pool,
    private readonly tenant: TenantContext,
  ) {}

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string | { text: string; values?: unknown[] },
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    const client = await this.inner.connect();
    try {
      const tid = this.tenant.boundTenantId() ?? '';
      const cid = this.tenant.boundCompanyId() ?? '';
      // One round-trip to bind both GUCs (session-level on this exclusively-held client).
      await client.query('SELECT set_config($1, $2, false), set_config($3, $4, false)', [
        'app.current_tenant_id', tid, 'app.current_company_id', cid,
      ]);
      return (await client.query(text as string, params)) as QueryResult<R>;
    } finally {
      // Reset before release so the next checkout of this physical connection starts clean.
      await client
        .query("SELECT set_config('app.current_tenant_id', '', false), set_config('app.current_company_id', '', false)")
        .catch(() => undefined);
      client.release();
    }
  }

  /** Pass-through: the tx runner sets its own transaction-local tenant GUC on the client. */
  connect(): Promise<PoolClient> {
    return this.inner.connect();
  }

  end(): Promise<void> {
    return this.inner.end();
  }
}
