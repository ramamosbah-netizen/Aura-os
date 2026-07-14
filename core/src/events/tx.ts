import type { Pool } from 'pg';
import { TenantContext } from '../tenancy/tenant-context';

/**
 * Opaque transaction handle threaded through the framework-free ports (module stores +
 * the event store). The Postgres impls cast it back to a `PoolClient`; `null` means "no
 * transaction" (in-memory dev), and each store then falls back to its own write. This
 * keeps the ports DB-agnostic while still enabling a real atomic write + event append.
 */
export type TxHandle = unknown;

/** DI token for the TxRunner. */
export const TX_RUNNER = Symbol('TX_RUNNER');

export interface TxRunner {
  /** Run `fn` inside one transaction. With no DB the handle is null (writes aren't atomic). */
  run<T>(fn: (tx: TxHandle | null) => Promise<T>): Promise<T>;
}

/** Real Postgres transaction: BEGIN → fn → COMMIT, ROLLBACK on throw. */
export class PostgresTxRunner implements TxRunner {
  constructor(
    private readonly pool: Pool,
    private readonly tenant: TenantContext,
  ) {}

  async run<T>(fn: (tx: TxHandle | null) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Bind the tenant GUC transaction-locally for the RLS policies. Fail closed: use the
      // BOUND request tenant (not the dev default) so a write outside any request scope sets
      // an empty tenant and RLS denies it, rather than silently writing as 'dev-tenant'.
      const tid = this.tenant.boundTenantId() ?? '';
      const cid = this.tenant.boundCompanyId() ?? '';
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tid]);
      await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', cid]);

      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** No-DB fallback: runs `fn(null)` — writes happen sequentially, not atomically (dev only). */
export class NullTxRunner implements TxRunner {
  run<T>(fn: (tx: TxHandle | null) => Promise<T>): Promise<T> {
    return fn(null);
  }
}

