import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { NullTxRunner, PostgresTxRunner } from './tx';
import { TenantContext } from '../tenancy/tenant-context';

function fakePool() {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, calls };
}

const mockTenant = {
  get: () => ({ tenantId: 't1', companyId: 'c1', actorId: 'u1' }),
} as unknown as TenantContext;

describe('PostgresTxRunner', () => {
  it('wraps fn in BEGIN/COMMIT, passes the client, and returns the result', async () => {
    const { pool, client, calls } = fakePool();
    const out = await new PostgresTxRunner(pool, mockTenant).run(async (tx) => {
      expect(tx).toBe(client);
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'SELECT set_config($1, $2, true)',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('ROLLBACKs and rethrows when fn throws (atomicity guarantee)', async () => {
    const { pool, client, calls } = fakePool();
    await expect(
      new PostgresTxRunner(pool, mockTenant).run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(calls).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'SELECT set_config($1, $2, true)',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('NullTxRunner', () => {
  it('runs fn with a null handle (no real transaction)', async () => {
    const seen: unknown[] = [];
    const out = await new NullTxRunner().run(async (tx) => {
      seen.push(tx);
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(seen).toEqual([null]);
  });
});
