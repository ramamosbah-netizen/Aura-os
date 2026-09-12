import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresQuantityLedgerStore } from './postgres-quantity-ledger-store';
import { quantityPosition, type QuantityTransaction } from './domain/quantity-transaction';

/**
 * Real PostgreSQL proof for the quantity position (TC-GATE-20).
 *
 * THE DEFECT THIS PINS, and it is not a guard — it is the number.
 *
 * `QuantityLedgerService.position` read one BOQ item's ledger through `list`, which applies a
 * default `LIMIT 500` ordered `occurred_at DESC`, and handed the result to `quantityPosition`, which
 * SUMS it. Past five hundred transactions on one item the position was understated — silently, with
 * no error and nothing in the shape of the answer to suggest it.
 *
 * AND IT WAS UNDERSTATED IN THE WORST PLACE. Newest-first discards the OLDEST rows, and the `boq`
 * baseline is the first transaction an item ever receives. Lose the baseline and `boq` reads 0, so
 * `remainingToOrder` goes negative and `progressPct` — which is `installed / boq` — collapses to
 * zero on an item that is fully installed. This is the ledger a quantity is billed from.
 *
 * Unlike TC-GATE-19's drawing defect, the in-memory adapter applies the SAME cap here, so this was
 * reachable from a unit test all along. Nobody wrote one with five hundred rows. Agreeing adapters
 * are not the same thing as a test that exercises the limit — which is why this proof exists.
 *
 * Gated on AURA_PG_APP_URL, which must resolve to the application role.
 */
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });
const URL = process.env.AURA_PG_APP_URL ?? process.env.PROJECTS_PG_TEST_URL;
const run = URL ? describe : describe.skip;

const TENANT = `qty-pos-${Date.now()}`;
const OTHER_TENANT = `qty-other-${Date.now()}`;
const PROJECT = randomUUID();
const BOQ = randomUUID();

/** The baseline, then enough movement to push it past the cap. */
const BASELINE = 1000;
const INSTALLED_ROWS = 599;
const PER_ROW = 1;
const TOTAL_ROWS = INSTALLED_ROWS + 1;

run('quantity position past the ledger cap', () => {
  let pool: Pool;
  let otherPool: Pool;
  let store: PostgresQuantityLedgerStore;
  let otherStore: PostgresQuantityLedgerStore;

  const txn = (over: Partial<QuantityTransaction>): QuantityTransaction => ({
    id: randomUUID(),
    tenantId: TENANT,
    companyId: null,
    projectId: PROJECT,
    boqItemId: BOQ,
    cbsNodeId: null,
    type: 'installed',
    quantity: PER_ROW,
    unit: 'nr',
    source: 'installation',
    sourceRef: 'pg-int',
    dimensions: null,
    dedupeKey: null,
    semantic: null,
    occurredAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    ...over,
  });

  beforeAll(async () => {
    const bound = (t: string): Pool => new Pool({ connectionString: URL, options: `-c app.current_tenant_id=${t}` });
    pool = bound(TENANT);
    otherPool = bound(OTHER_TENANT);
    store = new PostgresQuantityLedgerStore(pool);
    otherStore = new PostgresQuantityLedgerStore(otherPool);

    const role = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const current = role.rows[0];
    expect(current.rolsuper, `role ${current.rolname} must not be superuser`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS`).toBe(false);

    // The baseline FIRST, so it is the oldest row — exactly where a newest-first cap cuts.
    await store.append(txn({
      type: 'boq', quantity: BASELINE, source: 'boq_baseline',
      occurredAt: '2026-01-01T00:00:00.000Z',
      dedupeKey: `boq-baseline:${BOQ}`,
    }));
    for (let n = 1; n <= INSTALLED_ROWS; n += 1) {
      await store.append(txn({ occurredAt: new Date(Date.UTC(2026, 1, 1) + n * 60_000).toISOString() }));
    }

    await otherStore.append(txn({
      tenantId: OTHER_TENANT, type: 'boq', quantity: 7, source: 'boq_baseline',
      dedupeKey: `boq-baseline:${BOQ}`,
    }));
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_projects_quantity_ledger WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await otherPool?.query('DELETE FROM public.aura_projects_quantity_ledger WHERE tenant_id = $1', [OTHER_TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await otherPool?.end().catch(() => undefined);
  });

  /**
   * The defect, stated before the fix is shown to work. `list` is not broken — it is a listing read
   * doing what it says. What was broken was computing a position from it.
   */
  it('the capped read loses the baseline, and the position computed from it is wrong', async () => {
    const capped = await store.list({ tenantId: TENANT, boqItemId: BOQ });
    expect(capped).toHaveLength(500);
    expect(
      capped.some((t) => t.type === 'boq'),
      'newest-first drops the oldest rows, and the baseline is the oldest row there is',
    ).toBe(false);

    const wrong = quantityPosition(BOQ, capped);
    expect(wrong.boq, 'a target quantity of zero on an item with a thousand').toBe(0);
    expect(wrong.progressPct, 'installed / boq with no boq — the item reads as no progress at all').toBe(0);
    expect(wrong.installed, 'and even the installed total is short by the rows that fell off').toBeLessThan(INSTALLED_ROWS * PER_ROW);
  });

  it('reads the whole item, and the position is right', async () => {
    const all = await store.listForBoqItem(TENANT, BOQ);
    expect(all).toHaveLength(TOTAL_ROWS);

    const p = quantityPosition(BOQ, all);
    expect(p.boq).toBe(BASELINE);
    expect(p.installed).toBe(INSTALLED_ROWS * PER_ROW);
    expect(p.remainingToOrder).toBe(BASELINE);
    expect(p.progressPct).toBeCloseTo((INSTALLED_ROWS * PER_ROW) / BASELINE * 100, 2);
  });

  /**
   * `quantityPosition` takes the unit from the first row carrying one, so the order this read
   * returns is load-bearing for that one field. It is newest-first exactly as the capped read was,
   * so this gate changed completeness and nothing else.
   */
  it('returns newest first, which the position calculation depends on', async () => {
    const all = await store.listForBoqItem(TENANT, BOQ);
    const dates = all.map((t) => t.occurredAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('finds a keyed row however old it is', async () => {
    const found = await store.findByDedupeKey(TENANT, `boq-baseline:${BOQ}`);
    expect(found?.quantity, 'the baseline is row one of six hundred — a capped search never saw it').toBe(BASELINE);
    expect(await store.findByDedupeKey(TENANT, 'nothing-has-this-key')).toBeNull();
  });

  it('keeps another tenant out of both reads, even on the same BOQ item and key', async () => {
    expect(await otherStore.listForBoqItem(TENANT, BOQ)).toEqual([]);
    expect(await otherStore.findByDedupeKey(TENANT, `boq-baseline:${BOQ}`)).toBeNull();

    // Its own row, under the same key, is still its own — the key is unique PER TENANT.
    const own = await otherStore.findByDedupeKey(OTHER_TENANT, `boq-baseline:${BOQ}`);
    expect(own?.quantity).toBe(7);
  });
});
