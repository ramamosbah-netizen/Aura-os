import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

/**
 * Saved views — REAL Postgres proof of migration 0258.
 *
 * Two things the in-memory suite cannot show:
 *   · the unique index actually REFUSES a duplicate, so the no-duplicates rule does not depend on
 *     the service remembering to check first;
 *   · the dedupe rule is DETERMINISTIC — it keeps the oldest row, and a tie on `created_at` is
 *     broken by `id`, so the same input always produces the same survivor.
 *
 * The dedupe ran against an empty table when 0258 was applied to dev, so the rule would otherwise be
 * shipped unexercised. This runs it against rows that genuinely collide.
 *
 * Gated on CRM_PG_TEST_URL (migrations incl. 0258 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `views-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('saved views — Postgres uniqueness + deterministic dedupe', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_saved_views WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  const insert = (id: string, userId: string | null, label: string, path: string, query: string, createdAt: string) =>
    pool.query(
      `INSERT INTO public.aura_saved_views (id, tenant_id, user_id, label, path, query, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, TENANT, userId, label, path, query, createdAt],
    );

  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('the index REFUSES a second view for the same owner, route and query', async () => {
    await insert(uuid(1), 'u-a', 'Overdue', '/finance/invoices', 'status=overdue', '2026-01-01T00:00:00Z');
    await expect(
      insert(uuid(2), 'u-a', 'Overdue again', '/finance/invoices', 'status=overdue', '2026-01-02T00:00:00Z'),
    ).rejects.toThrow(/idx_aura_saved_views_owner_unique/i);
  });

  it('uniqueness is PER OWNER — a colleague may favourite the same page', async () => {
    await expect(
      insert(uuid(3), 'u-b', 'Overdue', '/finance/invoices', 'status=overdue', '2026-01-03T00:00:00Z'),
    ).resolves.toBeDefined();
  });

  it('EXACT-string, not semantic: reordered params are a different row, as documented', async () => {
    await insert(uuid(4), 'u-a', 'AB', '/x', 'a=1&b=2', '2026-01-04T00:00:00Z');
    // The index cannot claim these are the same view, because nothing canonicalises a querystring.
    await expect(insert(uuid(5), 'u-a', 'BA', '/x', 'b=2&a=1', '2026-01-05T00:00:00Z')).resolves.toBeDefined();
  });

  it('SHARED views are outside the constraint — NULLs are distinct in Postgres, deliberately', async () => {
    await insert(uuid(6), null, 'Team overdue', '/finance/invoices', 'status=overdue', '2026-01-06T00:00:00Z');
    await expect(
      insert(uuid(7), null, 'Team overdue (2)', '/finance/invoices', 'status=overdue', '2026-01-07T00:00:00Z'),
    ).resolves.toBeDefined();
  });

  it('the DEDUPE rule keeps the OLDEST and is deterministic under a created_at tie', async () => {
    // Build a colliding group the index would never allow, by dropping it for the duration.
    await pool.query('DROP INDEX IF EXISTS idx_aura_saved_views_owner_unique');
    try {
      const same = '2026-02-01T00:00:00Z';
      await insert(uuid(20), 'u-dedupe', 'oldest', '/dup', 'q=1', '2026-01-01T00:00:00Z');
      await insert(uuid(21), 'u-dedupe', 'newer', '/dup', 'q=1', '2026-03-01T00:00:00Z');
      // …and a tie on created_at, which `id` must break so the survivor is never arbitrary.
      await insert(uuid(30), 'u-tie', 'tie-low-id', '/tie', 'q=1', same);
      await insert(uuid(31), 'u-tie', 'tie-high-id', '/tie', 'q=1', same);

      // EXACTLY the statement migration 0258 runs.
      await pool.query(`
        delete from public.aura_saved_views v
        where v.user_id is not null
          and exists (
            select 1 from public.aura_saved_views keep
             where keep.tenant_id = v.tenant_id and keep.user_id = v.user_id
               and keep.path = v.path and keep.query = v.query
               and (keep.created_at, keep.id) < (v.created_at, v.id))
          and v.tenant_id = $1`, [TENANT]);

      const dup = await pool.query('select label from public.aura_saved_views where tenant_id=$1 and path=$2', [TENANT, '/dup']);
      expect(dup.rows.map((r) => r.label)).toEqual(['oldest']);   // the first one the user made

      const tie = await pool.query('select label from public.aura_saved_views where tenant_id=$1 and path=$2', [TENANT, '/tie']);
      expect(tie.rows).toHaveLength(1);
      expect(tie.rows[0].label).toBe('tie-low-id');               // id breaks it, not chance
    } finally {
      await pool.query(`create unique index if not exists idx_aura_saved_views_owner_unique
        on public.aura_saved_views (tenant_id, user_id, path, query) where user_id is not null`);
    }
  });
});
