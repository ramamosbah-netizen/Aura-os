import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresDrawingStore } from './postgres-drawing-store';
import { makeDrawing, type Drawing } from './domain/drawing';

/**
 * Real PostgreSQL proof for Engineering's release reads (TC-GATE-19).
 *
 * THE DEFECT THIS PINS.
 *
 * `DrawingStore.list` applies a default `LIMIT 100` ordered `created_at DESC`, and two resolvers were
 * built on it: Commissioning's "Engineering released" gate, and Engineering's own delivery-impact
 * health signal. A row in this table is a REVISION, not a drawing, so a hundred is an ordinary
 * number on an ordinary project.
 *
 * AND THE TRUNCATION WAS BIASED. Newest-first means the rows that fall off the end are the OLDEST —
 * which is exactly where a settled, approved drawing lives. The gate was looking for approved work
 * and the cap removed approved work first. This suite seeds that shape deliberately: thirty approved
 * revisions laid down before a hundred still under review.
 *
 * It runs against the Postgres store on purpose. The in-memory adapter applies NO default cap, so
 * the two adapters disagreed about `list` and no unit test in this repo could ever have shown it —
 * the same reason TC-GATE-18 proved its stock resolver against a real engine.
 *
 * Gated on ENGINEERING_PG_TEST_URL, which must resolve to the application role.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const URL = process.env.ENGINEERING_PG_TEST_URL;
const run = URL ? describe : describe.skip;

const TENANT = `eng-rel-${Date.now()}`;
const OTHER_TENANT = `eng-other-${Date.now()}`;
// A uuid because the column is one — the tenant column is text, which is why those stay readable.
const PROJECT = randomUUID();

/** Thirty approved, then a hundred under review — so the approved ones are the oldest rows. */
const APPROVED = 30;
const UNDER_REVIEW = 100;
const TOTAL = APPROVED + UNDER_REVIEW;

run('drawing release reads past the list cap', () => {
  let pool: Pool;
  let otherPool: Pool;
  let store: PostgresDrawingStore;
  let otherStore: PostgresDrawingStore;

  const seed = (n: number, status: Drawing['status'], tenantId: string): Drawing => ({
    ...makeDrawing({
      tenantId,
      projectId: PROJECT,
      code: `DWG-${String(n).padStart(4, '0')}`,
      title: `Drawing ${n}`,
      discipline: 'cctv',
      status,
    }),
    // Explicit, ordered timestamps: `makeDrawing` stamps `now`, and a hundred and thirty inserts
    // land inside the same millisecond often enough that "oldest" would otherwise be luck.
    createdAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
  });

  beforeAll(async () => {
    // The tenant is bound as a CONNECTION OPTION rather than by a `connect` handler that fires
    // `set_config` on the side. A handler's query is not awaited, so it races the first real
    // statement on that client — which is what the pg deprecation warning about concurrent
    // `client.query()` is warning about, and it produced a genuine bind-parameter mismatch here.
    // Set this way it is established before the session accepts anything, and it survives a
    // reconnect, which a one-shot `set_config` would not.
    const bound = (t: string): Pool =>
      new Pool({ connectionString: URL, options: `-c app.current_tenant_id=${t}` });
    pool = bound(TENANT);
    otherPool = bound(OTHER_TENANT);
    store = new PostgresDrawingStore(pool);
    otherStore = new PostgresDrawingStore(otherPool);

    const role = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const current = role.rows[0];
    expect(current.rolsuper, `role ${current.rolname} must not be superuser`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS`).toBe(false);

    for (let n = 1; n <= APPROVED; n += 1) await store.create(seed(n, 'approved', TENANT));
    for (let n = APPROVED + 1; n <= TOTAL; n += 1) await store.create(seed(n, 'under_review', TENANT));

    // One approved drawing on the SAME project id under a different tenant, so the reads below have
    // something to wrongly include if they ever stop scoping by tenant.
    await otherStore.create(seed(9001, 'approved', OTHER_TENANT));
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_engineering_drawings WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await otherPool?.query('DELETE FROM public.aura_engineering_drawings WHERE tenant_id = $1', [OTHER_TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await otherPool?.end().catch(() => undefined);
  });

  /**
   * The defect, before the fix is shown to work. `list` is not broken — it is a LISTING read doing
   * what it says. What was broken was answering "is this system's engineering released?" with it.
   */
  it('the list read caps at a hundred, and every approved drawing falls off the end', async () => {
    const listed = await store.list({ tenantId: TENANT, projectId: PROJECT });
    expect(listed.length, 'the default cap is a hundred, whatever the project holds').toBe(100);
    expect(
      listed.filter((d) => d.status === 'approved'),
      'newest-first throws away the oldest rows, and the approved ones are the oldest — so a gate reading this saw NO approved drawing on a project with thirty',
    ).toHaveLength(0);
  });

  it('summarises the whole project, past any cap', async () => {
    const release = await store.summariseRelease(TENANT, PROJECT);
    const approved = release.find((r) => r.status === 'approved');
    const underReview = release.find((r) => r.status === 'under_review');

    expect(approved?.count, 'all thirty, including the ones the capped list could not see').toBe(APPROVED);
    expect(underReview?.count).toBe(UNDER_REVIEW);
    expect(release.reduce((n, r) => n + r.count, 0)).toBe(TOTAL);
    expect(release.every((r) => r.discipline === 'cctv')).toBe(true);
  });

  it('cannot be truncated by a caller, because it takes no limit', async () => {
    // The shape is the guarantee: there is no parameter to pass. The result is bounded by the
    // vocabulary — disciplines times statuses — so it stays small without ever being cut short.
    expect(await store.summariseRelease(TENANT, PROJECT)).toHaveLength(2);
  });

  it('returns every outstanding revision, oldest first', async () => {
    const outstanding = await store.listByStatus(TENANT, PROJECT, ['submitted', 'under_review']);
    expect(outstanding).toHaveLength(UNDER_REVIEW);

    const dates = outstanding.map((d) => d.createdAt);
    expect([...dates].sort(), 'oldest first: the longest-outstanding review is the one a reader needs named').toEqual(dates);
  });

  it('shows another tenant nothing of this project, by either read', async () => {
    const release = await otherStore.summariseRelease(TENANT, PROJECT);
    expect(release, 'the tenant column is in the WHERE, and row-level security is behind it').toEqual([]);

    const own = await otherStore.summariseRelease(OTHER_TENANT, PROJECT);
    expect(own.reduce((n, r) => n + r.count, 0), 'its own drawing on the same project id is still its own').toBe(1);
  });
});
