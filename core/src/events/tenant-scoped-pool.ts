import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { TenantContext } from '../tenancy/tenant-context';

/** A client that accepts `query()` — both `Pool` and `PoolClient` satisfy this. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

/**
 * Bind the ambient request/worker tenant to the session-level RLS GUCs on `client`.
 * Fail closed: with no bound tenant the GUC is set to '' so `current_tenant_id()` is NULL and
 * the policies (`tenant_id = current_tenant_id()`) match no rows. One round-trip for both GUCs.
 */
export async function bindTenantGuc(client: Queryable, tenant: TenantContext): Promise<void> {
  const tid = tenant.boundTenantId() ?? '';
  const cid = tenant.boundCompanyId() ?? '';
  await client.query('SELECT set_config($1, $2, false), set_config($3, $4, false)', [
    'app.current_tenant_id', tid, 'app.current_company_id', cid,
  ]);
}

/** Clear the session tenant GUCs (best-effort) so a pooled connection starts the next checkout clean. */
export async function resetTenantGuc(client: Queryable): Promise<void> {
  await client
    .query("SELECT set_config('app.current_tenant_id', '', false), set_config('app.current_company_id', '', false)")
    .catch(() => undefined);
}

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
 *  - `connect()` binds the SAME session GUC on the checked-out client (and resets it on release).
 *    This closes the hole where a caller that manages its own transaction — the numbering engine,
 *    the journal/document stores, the event store, the projection engine — connects **directly**
 *    (bypassing both `query()` above and the tx runner) and would otherwise run with no tenant
 *    context, so under an enforced (non-BYPASSRLS) role its writes would fail closed. The
 *    {@link PostgresTxRunner} additionally sets a transaction-LOCAL GUC, which simply re-affirms
 *    the same tenant; per-event workers (the outbox relay) bind the ambient tenant via
 *    `TenantContext.run()` before connecting, so their reactor writes are scoped correctly.
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
      await bindTenantGuc(client, this.tenant);
      return (await client.query(text as string, params)) as QueryResult<R>;
    } finally {
      // Reset before release so the next checkout of this physical connection starts clean.
      await resetTenantGuc(client);
      client.release();
    }
  }

  /**
   * Check out a client with the ambient request/worker tenant bound to the session GUC, and
   * wrap `release()` so the GUC is reset before the physical connection returns to the pool.
   * Callers that own their own `BEGIN`/`COMMIT` (numbering, journal/document/event stores, the
   * projection engine) get RLS-correct writes without each having to bind the GUC themselves —
   * and never leak a tenant to the next checkout. The tx runner's transaction-local set is a
   * redundant re-affirmation on top of this, not the only line of defence.
   */
  async connect(): Promise<PoolClient> {
    const client = await this.inner.connect();
    try {
      await bindTenantGuc(client, this.tenant);
    } catch (err) {
      client.release();
      throw err;
    }
    const rawRelease = client.release.bind(client);
    let released = false;
    // Defer the physical release until the reset completes; pg does not reuse the connection
    // until rawRelease runs, so this window is safe. On an error release (a truthy arg destroys
    // the connection) skip the reset — the connection is discarded anyway.
    (client as unknown as { release: (arg?: unknown) => void }).release = (arg?: unknown): void => {
      if (released) return;
      released = true;
      if (arg) return rawRelease(arg as never);
      resetTenantGuc(client).then(() => rawRelease(), () => rawRelease());
    };
    return client;
  }

  end(): Promise<void> {
    return this.inner.end();
  }
}
