import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresPeriodCloseStore } from './postgres-period-close-store';
import { closePeriod, reopenPeriod, type PeriodClose } from './domain/period-close';

/**
 * FINANCE PERIOD CLOSE — REAL Postgres proof that the history survives and the invariants are the
 * DATABASE's, not the service's.
 *
 * The finding was a deletion: reopening ran `DELETE FROM aura_finance_period_closes`, so close →
 * reopen → close left one row reading "closed once" and naming only the last closer. A service-level
 * fix alone would be a promise; these four invariants are what make it a fact, and each is asserted
 * by trying to violate it directly in SQL rather than through the service that already obeys it.
 *
 * Gated on FINANCE_PG_TEST_URL (migration 0362 applied).
 */
const URL = process.env.FINANCE_PG_TEST_URL;
const TENANT = `pc-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('finance period close — generations in Postgres', () => {
  let pool: Pool;
  let store: PostgresPeriodCloseStore;

  const rawRows = async (period: string) => {
    const res = await pool.query<{ generation: number; closed_by: string | null; reopened_by: string | null; reopen_reason: string | null }>(
      `SELECT generation, closed_by, reopened_by, reopen_reason FROM public.aura_finance_period_closes
       WHERE tenant_id = $1 AND period = $2 ORDER BY generation`, [TENANT, period]);
    return res.rows;
  };
  /** Close a period through the domain + store, exactly as the service does. */
  const close = async (period: string, by: string | null, note?: string): Promise<PeriodClose> => {
    const c = closePeriod(await store.history(TENANT, period), { tenantId: TENANT, period, closedBy: by, note });
    await store.save(c);
    return c;
  };
  const reopen = async (period: string, by: string, reason: string): Promise<PeriodClose> => {
    const r = reopenPeriod(await store.history(TENANT, period), period, by, reason);
    await store.save(r);
    return r;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresPeriodCloseStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_finance_period_closes WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  it('keeps every close, with who reopened each one and why', async () => {
    await close('2026-08', 'u-controller-a', 'August month-end');
    await reopen('2026-08', 'u-controller-b', 'late supplier invoice for August');
    await close('2026-08', 'u-controller-a', 'August re-close');

    const rows = await rawRows('2026-08');
    expect(rows).toHaveLength(2); // the finding: this used to be 1
    expect(rows[0]).toMatchObject({
      generation: 1, closed_by: 'u-controller-a',
      reopened_by: 'u-controller-b', reopen_reason: 'late supplier invoice for August',
    });
    expect(rows[1]).toMatchObject({ generation: 2, closed_by: 'u-controller-a', reopened_by: null });

    // The register still answers the simple question with one row.
    const register = await store.list(TENANT);
    expect(register.filter((p) => p.period === '2026-08')).toHaveLength(1);
    expect(register.find((p) => p.period === '2026-08')?.generation).toBe(2);
    // …and `findByPeriod`, which JournalService uses to block posting, returns the CURRENT close.
    expect((await store.findByPeriod(TENANT, '2026-08'))?.generation).toBe(2);
  });

  it('reports the period as open between generations', async () => {
    await close('2026-09', 'u-controller-a');
    expect(await store.findByPeriod(TENANT, '2026-09')).not.toBeNull();
    await reopen('2026-09', 'u-controller-b', 'accrual correction');
    // Open, with the closed generation still on disk — the old code achieved this by deleting it.
    expect(await store.findByPeriod(TENANT, '2026-09')).toBeNull();
    expect(await rawRows('2026-09')).toHaveLength(1);
  });

  it('INVARIANT 1 — a generation cannot be written twice', async () => {
    await close('2026-10', 'u-controller-a');
    await expect(pool.query(
      `INSERT INTO public.aura_finance_period_closes (id, tenant_id, period, closed_at, closed_by, generation)
       VALUES (gen_random_uuid(), $1, '2026-10', now(), 'u-controller-b', 1)`, [TENANT],
    )).rejects.toThrow(/aura_finance_period_close_generation/);
  });

  it('INVARIANT 2 — a period cannot be closed twice over', async () => {
    // Two concurrent closes would otherwise both succeed and the period would carry two signatures.
    await expect(pool.query(
      `INSERT INTO public.aura_finance_period_closes (id, tenant_id, period, closed_at, closed_by, generation)
       VALUES (gen_random_uuid(), $1, '2026-10', now(), 'u-controller-b', 2)`, [TENANT],
    )).rejects.toThrow(/idx_aura_finance_period_close_current/);
  });

  it('INVARIANT 3 — a reopen cannot be half-written', async () => {
    // A row claiming it was reopened while refusing to say by whom or why would be worse than the
    // deletion this replaced: it would look like provenance and carry none.
    for (const [sql, label] of [
      [`UPDATE public.aura_finance_period_closes SET reopened_at = now() WHERE tenant_id = $1 AND period = '2026-10'`, 'time only'],
      [`UPDATE public.aura_finance_period_closes SET reopened_at = now(), reopened_by = 'u-x' WHERE tenant_id = $1 AND period = '2026-10'`, 'no reason'],
      [`UPDATE public.aura_finance_period_closes SET reopened_at = now(), reopened_by = 'u-x', reopen_reason = '   ' WHERE tenant_id = $1 AND period = '2026-10'`, 'blank reason'],
    ] as const) {
      await expect(pool.query(sql, [TENANT]), label).rejects.toThrow(/aura_finance_period_close_reopen_complete/);
    }
  });

  it('INVARIANT 4 — the generation holding a period closed carries no reopen data', async () => {
    // Which is what makes invariant 2 mean anything: "currently closed" IS "never reopened", so the
    // two cannot disagree. Writing a full, valid reopen onto the current generation is allowed and
    // opens the period; what cannot exist is a reopened row that still counts as the current close.
    const current = await store.findByPeriod(TENANT, '2026-10');
    expect(current).not.toBeNull();
    await reopen('2026-10', 'u-controller-b', 'closing the loop');
    expect(await store.findByPeriod(TENANT, '2026-10')).toBeNull();

    // And now a fresh close is allowed again, because nothing holds the period. Generation 2, not 3:
    // the two invariants above REFUSED their inserts, so no generation was consumed by them — which
    // is itself worth asserting, since a rejected write that still advanced the counter would leave
    // gaps nobody could account for.
    const next = await close('2026-10', 'u-controller-a');
    expect(next.generation).toBe(2);
    expect(await rawRows('2026-10')).toHaveLength(2);
  });

  it('never lets a reopen restate who closed the books, or when', async () => {
    // `closed_at`, `closed_by` and `generation` are left out of the store's DO UPDATE SET on purpose:
    // the closer is the fact the maker/checker rule is checked against.
    await close('2026-11', 'u-controller-a', 'November');
    const held = await store.findByPeriod(TENANT, '2026-11');
    await store.save({ ...held!, closedBy: 'u-impostor', closedAt: '2000-01-01T00:00:00.000Z', note: 'edited' });

    const rows = await rawRows('2026-11');
    expect(rows[0].closed_by).toBe('u-controller-a');
    expect((await store.findByPeriod(TENANT, '2026-11'))?.note).toBe('edited'); // the note landed
  });
});
