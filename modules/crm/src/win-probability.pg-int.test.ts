import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Win-probability range integrity at the PERSISTENCE boundary — proven against real Postgres.
 *
 * The DTO and the domain guard are both app-layer: neither binds psql, a migration, an ad-hoc fix
 * script, or a bug that reaches the store directly. Only the CHECK constraint does, and a
 * constraint that is never exercised is an assumption. So this suite runs the SHIPPED migration
 * text and then tries the writes it is supposed to refuse.
 *
 * NaN is the case that motivated the constraint: NUMERIC (unlike INTEGER) accepts NaN, and
 * `JSON.stringify(NaN)` is `null` — a NaN row would be served as `"winProbability": null`, breaking
 * the non-nullable `winProbability: number` contract. It is refused by the plain range comparison,
 * because `'NaN'::numeric <= 100` is FALSE; there is no separate NaN clause and none is needed.
 *
 * Everything runs inside ONE transaction that is always rolled back — no row and no DDL survives.
 *
 *   CRM_PG_TEST_URL=postgres://user:pass@host:5432/db pnpm --filter @aura/crm test win-probability.pg-int
 */
const URL = process.env.CRM_PG_TEST_URL;
const run = URL ? describe : describe.skip;

const MIGRATION = resolve(__dirname, '../../../infrastructure/migrations/0252_crm_opportunity_win_probability_range.sql');
const TENANT = `winprob-int-${Date.now()}`;

run('win_probability CHECK constraint — real Postgres', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [TENANT]);
    // Apply the migration's up-half verbatim. DDL is transactional in Postgres, so the ROLLBACK in
    // afterAll removes it — and running the SHIPPED text (not a re-typed copy) is what makes this a
    // proof of the migration rather than of a lookalike.
    const sql = readFileSync(MIGRATION, 'utf8');
    await client.query(sql.split('-- @DOWN')[0]);
  });

  afterAll(async () => {
    await client?.query('ROLLBACK').catch(() => undefined);
    client?.release();
    await pool?.end();
  });

  /** Attempt one insert on a savepoint; report accepted/rejected without poisoning the tx. */
  async function attempt(value: string): Promise<{ ok: boolean; code?: string; constraint?: string }> {
    await client.query('SAVEPOINT s');
    try {
      await client.query(
        'INSERT INTO public.aura_crm_opportunities (tenant_id, title, win_probability) VALUES ($1, $2, $3::numeric)',
        [TENANT, `probe ${value}`, value],
      );
      await client.query('ROLLBACK TO SAVEPOINT s');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT s');
      const err = e as { code?: string; constraint?: string };
      return { ok: false, code: err.code, constraint: err.constraint };
    }
  }

  it('the constraint is present and VALIDATED (not NOT VALID)', async () => {
    const { rows } = await client.query(
      `SELECT conname, convalidated FROM pg_constraint
        WHERE conrelid = 'public.aura_crm_opportunities'::regclass
          AND conname = 'aura_crm_opportunities_win_probability_range'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].convalidated).toBe(true);
  });

  it.each(['0', '100', '20.5', '0.01', '99.99'])('accepts a direct SQL insert of %s', async (v) => {
    expect(await attempt(v)).toEqual({ ok: true });
  });

  it.each(['-0.01', '100.01', '150', '-10', '999.99'])('refuses a direct SQL insert of %s', async (v) => {
    const r = await attempt(v);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('23514'); // check_violation
    expect(r.constraint).toBe('aura_crm_opportunities_win_probability_range');
  });

  it('refuses NaN — the case the app-layer guards cannot reach', async () => {
    const r = await attempt('NaN');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('23514');
    expect(r.constraint).toBe('aura_crm_opportunities_win_probability_range');
  });

  it('documents WHY no explicit NaN clause is needed (measured, not assumed)', async () => {
    const { rows } = await client.query(`
      SELECT ('NaN'::numeric >= 0 AND 'NaN'::numeric <= 100) AS passes_range,
             ('NaN'::numeric > 100)                          AS gt_100,
             ('NaN'::numeric = 'NaN'::numeric)               AS eq_self,
             ('NaN'::numeric IS NULL)                        AS is_null`);
    // NaN fails the range comparison, so the two-clause CHECK already covers it.
    expect(rows[0].passes_range).toBe(false);
    expect(rows[0].gt_100).toBe(true); // NaN sorts above every non-NaN in Postgres
    expect(rows[0].eq_self).toBe(true);
    expect(rows[0].is_null).toBe(false);
  });

  it('refuses a direct SQL UPDATE that would push an existing row out of range', async () => {
    await client.query(
      'INSERT INTO public.aura_crm_opportunities (tenant_id, title, win_probability) VALUES ($1, $2, 40)',
      [TENANT, 'update probe'],
    );
    for (const bad of ['150', 'NaN', '-5']) {
      await client.query('SAVEPOINT u');
      await expect(
        client.query('UPDATE public.aura_crm_opportunities SET win_probability = $1::numeric WHERE tenant_id = $2', [bad, TENANT]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'aura_crm_opportunities_win_probability_range' });
      await client.query('ROLLBACK TO SAVEPOINT u');
    }
    // A legitimate value still lands — the constraint refuses bad writes, not all writes.
    const ok = await client.query('UPDATE public.aura_crm_opportunities SET win_probability = 75 WHERE tenant_id = $1', [TENANT]);
    expect(ok.rowCount).toBe(1);
  });
});
