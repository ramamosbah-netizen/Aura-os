import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgresEventDeliveryStore } from './postgres-event-delivery-store';

/**
 * Real PostgreSQL proof for the per-handler delivery log (TC-GATE-22, migration 0306).
 *
 * Three properties, and each is load-bearing on the retry path:
 *
 *   1. A repeat record must NOT raise. Two relays racing the same event both insert; if the second
 *      threw, a side effect that HAPPENED would be turned into a failed event, and the retry would
 *      cause the duplicate the log exists to prevent.
 *   2. It must be append-only. A delivery record is evidence that money moved or a webhook left the
 *      building — editing one is editing history, and the retry path trusts it.
 *   3. It must be tenant-scoped, like every other table here.
 *
 * Gated on AURA_PG_APP_URL, which must resolve to the application role.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const URL = process.env.AURA_PG_APP_URL ?? process.env.CORE_PG_TEST_URL;
const run = URL ? describe : describe.skip;

const TENANT = `evt-del-${Date.now()}`;
const OTHER = `evt-other-${Date.now()}`;
const EVENT = `event-${Date.now()}`;
const HANDLER = 'post inventory GL from stock.movement_recorded';

run('per-handler delivery log', () => {
  let pool: Pool;
  let otherPool: Pool;
  let store: PostgresEventDeliveryStore;
  let otherStore: PostgresEventDeliveryStore;

  beforeAll(async () => {
    const bound = (t: string): Pool => new Pool({ connectionString: URL, options: `-c app.current_tenant_id=${t}` });
    pool = bound(TENANT);
    otherPool = bound(OTHER);
    store = new PostgresEventDeliveryStore(pool);
    otherStore = new PostgresEventDeliveryStore(otherPool);

    const role = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(role.rows[0].rolsuper, 'the app role must not be superuser').toBe(false);
    expect(role.rows[0].rolbypassrls, 'the app role must not bypass RLS').toBe(false);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_event_handler_deliveries WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await otherPool?.query('DELETE FROM public.aura_event_handler_deliveries WHERE tenant_id = $1', [OTHER]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await otherPool?.end().catch(() => undefined);
  });

  it('records a delivery and reads it back', async () => {
    expect(await store.wasDelivered(TENANT, EVENT, HANDLER)).toBe(false);
    await store.markDelivered(TENANT, EVENT, HANDLER);
    expect(await store.wasDelivered(TENANT, EVENT, HANDLER)).toBe(true);
  });

  it('absorbs a repeat record instead of raising — a racing relay must not fail the event', async () => {
    await expect(store.markDelivered(TENANT, EVENT, HANDLER)).resolves.toBeUndefined();

    const count = await pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM public.aura_event_handler_deliveries
        WHERE tenant_id = $1 AND event_id = $2 AND handler = $3`,
      [TENANT, EVENT, HANDLER],
    );
    expect(Number(count.rows[0].n), 'the unique index keeps it to one row').toBe(1);
  });

  it('distinguishes handlers on the same event', async () => {
    const other = 'post material quantity txn from stock.movement_recorded';
    expect(await store.wasDelivered(TENANT, EVENT, other)).toBe(false);
    await store.markDelivered(TENANT, EVENT, other);

    const handlers = await store.deliveredHandlers(TENANT, EVENT);
    expect(handlers.sort()).toEqual([HANDLER, other].sort());
  });

  /**
   * Append-only, enforced by having no UPDATE or DELETE policy at all. RLS refuses by making rows
   * invisible rather than raising, so the statement succeeds and affects NOTHING — which is the
   * shape the assertion has to take.
   */
  it('cannot be edited or erased, because a delivery record is evidence', async () => {
    const updated = await pool.query(
      `UPDATE public.aura_event_handler_deliveries SET handler = 'tampered'
        WHERE tenant_id = $1 AND event_id = $2`,
      [TENANT, EVENT],
    );
    expect(updated.rowCount, 'no UPDATE policy — the rows are not visible to modify').toBe(0);

    const deleted = await pool.query(
      `DELETE FROM public.aura_event_handler_deliveries WHERE tenant_id = $1 AND event_id = $2`,
      [TENANT, EVENT],
    );
    expect(deleted.rowCount, 'and no DELETE policy either').toBe(0);

    expect(await store.wasDelivered(TENANT, EVENT, HANDLER), 'the record still stands').toBe(true);
  });

  it('keeps one tenant out of another tenant’s deliveries', async () => {
    expect(await otherStore.wasDelivered(TENANT, EVENT, HANDLER)).toBe(false);
    expect(await otherStore.deliveredHandlers(TENANT, EVENT)).toEqual([]);

    // The same event id under its own tenant is its own business.
    await otherStore.markDelivered(OTHER, EVENT, HANDLER);
    expect(await otherStore.wasDelivered(OTHER, EVENT, HANDLER)).toBe(true);
    expect(await store.wasDelivered(OTHER, EVENT, HANDLER), 'and invisible from the first tenant').toBe(false);
  });
});
