import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, TenantContext } from '@aura/core';
import { PostgresTenderStore } from './postgres-tender-store';
import { makeTender, type Tender } from './domain/tender';
import { makeTenderAwardEvidence } from './domain/tender-award-evidence';
import { makeTenderCommercialBasis } from './domain/tender-commercial-basis';

/**
 * ADR-0021 follow-up — REAL Postgres proof of the award's commercial basis (migration 0256).
 *
 * Properties of the DATABASE, unprovable in memory:
 *   · an established basis cannot be rewritten or cleared by ANY writer, raw SQL included (trigger)
 *   · a basis cannot exist on a tender that was never won                        (check constraint)
 *   · a malformed or negative basis is refused at the persistence boundary       (check constraint)
 *   · a rolled-back award leaves NO basis behind                                 (real transaction)
 *
 * Gated on CRM_PG_TEST_URL (migrations incl. 0256 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `tender-basis-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

const AWARDED_AT = '2026-08-21T07:30:00.000Z';

run('tender commercial basis — Postgres immutability + atomicity', () => {
  let pool: Pool;
  let tx: PostgresTxRunner;
  let store: PostgresTenderStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    tx = new PostgresTxRunner(pool, new TenantContext());
    store = new PostgresTenderStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_tendering_tenders WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  const evidence = () => makeTenderAwardEvidence({
    awardedValue: 700_000, currency: 'AED', awardedAt: AWARDED_AT, capturedBy: 'u-bid-manager',
  });
  const basis = (over: Record<string, unknown> = {}) => makeTenderCommercialBasis({
    kind: 'AT_AWARD', baselineId: 'baseline-1', quotationId: 'q-1', value: 640_000, establishedAt: AWARDED_AT, ...over,
  });

  /** A submitted tender; `won` when asked, which is what a basis presupposes. */
  async function seed(won: boolean): Promise<string> {
    const t: Tender = { ...makeTender({ tenantId: TENANT, title: 'PG basis tender', value: 800_000 }), status: won ? 'won' : 'submitted' };
    await store.create(t);
    if (won) await store.awardWithClient(null, t.id, evidence());
    return t.id;
  }

  /** Fresh-connection read — never the pool the write went through. */
  async function readRaw(id: string) {
    const fresh = new Pool({ connectionString: URL });
    fresh.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    try {
      return (await fresh.query('select status, value, commercial_basis from public.aura_tendering_tenders where id=$1', [id])).rows[0];
    } finally { await fresh.end(); }
  }

  it('persists the basis, and a fresh connection reads it back beside the untouched estimate', async () => {
    const id = await seed(true);
    expect(await store.linkCommercialBasisWithClient(null, id, basis())).toBe(true);

    const row = await readRaw(id);
    expect(row.commercial_basis.kind).toBe('AT_AWARD');
    expect(row.commercial_basis.baselineId).toBe('baseline-1');
    expect(row.commercial_basis.value).toBe(640_000);
    expect(Number(row.value)).toBe(800_000); // the estimate, a separate number, untouched
    expect((await store.get(id))!.commercialBasis!.value).toBe(640_000);
  });

  it('a failure inside the transaction leaves NO basis behind', async () => {
    const id = await seed(true);
    await expect(
      tx.run(async (handle) => {
        await store.linkCommercialBasisWithClient(handle, id, basis());
        throw new Error('boom-basis-tx');
      }),
    ).rejects.toThrow(/boom-basis-tx/);
    expect((await readRaw(id)).commercial_basis).toBeNull();
  });

  it('THE DATABASE refuses to re-base or clear an established basis — even from raw SQL', async () => {
    const id = await seed(true);
    await store.linkCommercialBasisWithClient(null, id, basis());

    const competing = basis({ baselineId: 'baseline-2', quotationId: 'q-2', value: 9_999_999 });
    await expect(
      pool.query('update public.aura_tendering_tenders set commercial_basis=$2 where id=$1', [id, JSON.stringify(competing)]),
    ).rejects.toThrow(/immutable once established/i);
    await expect(
      pool.query('update public.aura_tendering_tenders set commercial_basis=null where id=$1', [id]),
    ).rejects.toThrow(/immutable once established/i);

    expect((await readRaw(id)).commercial_basis.baselineId).toBe('baseline-1');
  });

  it('the write-once method reports a replay rather than overwriting', async () => {
    const id = await seed(true);
    await store.linkCommercialBasisWithClient(null, id, basis());
    expect(await store.linkCommercialBasisWithClient(null, id, basis({ baselineId: 'baseline-2', value: 1 }))).toBe(false);
    expect((await readRaw(id)).commercial_basis.baselineId).toBe('baseline-1');
  });

  it('a basis cannot exist on a tender that was never won', async () => {
    const id = await seed(false); // submitted, never awarded
    await expect(store.linkCommercialBasisWithClient(null, id, basis()))
      .rejects.toThrow(/commercial_basis_needs_won/i);
    expect((await readRaw(id)).commercial_basis).toBeNull();
  });

  it('the persistence boundary refuses a malformed or negative basis', async () => {
    const id = await seed(true);
    const bad = (patch: Record<string, unknown>) =>
      pool.query('update public.aura_tendering_tenders set commercial_basis=$2 where id=$1',
        [id, JSON.stringify({ ...basis(), ...patch })]);

    await expect(bad({ value: -1 })).rejects.toThrow(/commercial_basis_valid/i);
    await expect(bad({ value: 'lots' })).rejects.toThrow(/commercial_basis_valid/i);
    await expect(bad({ kind: 'WHENEVER' })).rejects.toThrow(/commercial_basis_valid/i);
    await expect(bad({ baselineId: '' })).rejects.toThrow(/commercial_basis_valid/i);

    // …and a real 0 approved total is accepted, at the database too.
    await pool.query('update public.aura_tendering_tenders set commercial_basis=$2 where id=$1',
      [id, JSON.stringify({ ...basis(), value: 0 })]);
    expect((await readRaw(id)).commercial_basis.value).toBe(0);
  });
});
