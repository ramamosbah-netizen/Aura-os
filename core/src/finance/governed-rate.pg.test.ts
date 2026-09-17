import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * FX-01's governed store, against REAL PostgreSQL.
 *
 * This exists because the API e2e suite runs on in-memory stores, so everything it proves about the
 * strict resolver is proved against the service's own in-process registry. The invariants that
 * actually protect money live in the SQL — the `effective_date <= $4` window, the tenant predicate,
 * the inverse lookup and the absence of any fallback — and none of them is exercised by a test that
 * never touches the table.
 *
 * It SKIPS without a DATABASE_URL so it does not fail a machine that has no database, and RUNS in
 * CI wherever one is configured. A skip is reported as a skip, never as a pass.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch {
    // no env file — treated as "no database", which is a skip, not a failure
  }
  return undefined;
}

describe('the governed rate store (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let fx: ExchangeRateService;
  const TENANT = `fxpg-${Date.now()}`;
  const OTHER_TENANT = `fxpg-other-${Date.now()}`;

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    // Bind the tenant GUC on checkout the way the runtime pool does: under the enforced aura_app
    // role an unbound connection is refused by RLS, which is the point of the role.
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    fx = new ExchangeRateService(pool);
    expect(fx.governedSourceOfTruth).toBe('postgres');
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM public.aura_exchange_rates WHERE tenant_id = ANY($1)', [[TENANT, OTHER_TENANT]]);
    await pool.end();
  });

  /**
   * A real skip, not a silent pass. `expect(true).toBe(true)` under a missing database would report
   * green for invariants that never ran — the exact dishonesty this suite exists to prevent.
   */
  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => {
      if (!pool) { ctx.skip(); return; }
      await body();
    });

  skipless('resolves the rate effective ON OR BEFORE the date, from the table', async () => {
    await fx.setRate(TENANT, 'EUR', 'AED', 4.0, new Date('2026-08-01'));
    await fx.setRate(TENANT, 'EUR', 'AED', 4.3, new Date('2026-09-10'));

    const early = await fx.resolveGovernedRate(TENANT, 'EUR', 'AED', new Date('2026-09-01'));
    expect(early).toMatchObject({ status: 'governed', rate: 4.0, effectiveDate: '2026-08-01', source: 'stored' });

    const later = await fx.resolveGovernedRate(TENANT, 'EUR', 'AED', new Date('2026-09-17'));
    expect(later).toMatchObject({ status: 'governed', rate: 4.3, effectiveDate: '2026-09-10' });
  });

  skipless('carries the governed ROW ID, so a booked amount can be traced to the rate that valued it', async () => {
    await fx.setRate(TENANT, 'GBP', 'AED', 4.66, new Date('2026-09-01'));
    const resolved = await fx.resolveGovernedRate(TENANT, 'GBP', 'AED', new Date('2026-09-17'));
    expect(resolved.status).toBe('governed');
    if (resolved.status !== 'governed') throw new Error('unreachable');
    expect(resolved.rateId).toMatch(/^[0-9a-f-]{36}$/);

    const row = await pool!.query('SELECT rate::float AS rate FROM public.aura_exchange_rates WHERE id = $1', [resolved.rateId]);
    expect(Number(row.rows[0].rate)).toBe(4.66);
  });

  skipless('REFUSES before the effective date — a rate does not apply retrospectively', async () => {
    await fx.setRate(TENANT, 'SAR', 'AED', 0.98, new Date('2026-09-15'));
    const before = await fx.resolveGovernedRate(TENANT, 'SAR', 'AED', new Date('2026-09-01'));
    expect(before).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });

  skipless('derives a stored INVERSE and says that it derived it', async () => {
    await fx.setRate(TENANT, 'AED', 'USD', 0.2723, new Date('2026-09-01'));
    const resolved = await fx.resolveGovernedRate(TENANT, 'USD', 'AED', new Date('2026-09-17'));
    expect(resolved.status).toBe('governed');
    if (resolved.status !== 'governed') throw new Error('unreachable');
    expect(resolved.source).toBe('stored-inverse');
    expect(resolved.rate).toBeCloseTo(1 / 0.2723, 6);
  });

  skipless('does not answer one tenant with another tenant’s governed rate', async () => {
    await fx.setRate(TENANT, 'EUR', 'AED', 4.0, new Date('2026-08-01'));
    // A SECOND service on its own connection, bound to a different tenant — the isolation the
    // runtime actually runs under, not a filter applied in application code.
    const otherPool = new Pool({ connectionString: databaseUrl() });
    otherPool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${OTHER_TENANT}', false)`);
    });
    try {
      const other = new ExchangeRateService(otherPool);
      const resolved = await other.resolveGovernedRate(OTHER_TENANT, 'EUR', 'AED', new Date('2026-09-17'));
      expect(resolved).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
    } finally {
      await otherPool.end();
    }
  });

  skipless('NEVER falls back to a peg — an ungoverned pair stays unknown against the real table', async () => {
    // getRate() answers this from a hardcoded constant even with a database present.
    expect(await fx.getRate(TENANT, 'GBP', 'SAR')).toBeGreaterThan(0);
    const resolved = await fx.resolveGovernedRate(TENANT, 'GBP', 'SAR', new Date('2026-09-17'));
    expect(resolved).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });

  skipless('NEVER falls back to an in-process registration when the table has no row', async () => {
    // Registered for THIS tenant in memory only — setRate writes both, so delete the row to leave
    // the in-process copy behind, which is exactly the state that must not govern money.
    await fx.setRate(TENANT, 'USD', 'SAR', 3.75, new Date('2026-09-01'));
    await pool!.query(
      `DELETE FROM public.aura_exchange_rates WHERE tenant_id = $1 AND from_currency = 'USD' AND to_currency = 'SAR'`,
      [TENANT],
    );
    const resolved = await fx.resolveGovernedRate(TENANT, 'USD', 'SAR', new Date('2026-09-17'));
    expect(resolved).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });
});
