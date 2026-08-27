import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, TenantContext } from '@aura/core';
import { PostgresTenderStore } from './postgres-tender-store';
import { makeTender, type Tender } from './domain/tender';
import { makeTenderAwardEvidence } from './domain/tender-award-evidence';

/**
 * ADR-0021 — REAL Postgres proof of Tender Award Evidence (migration 0253).
 *
 * These invariants are properties of the DATABASE, not of the code, and cannot be proven in memory:
 *
 *   · a rolled-back award leaves NO evidence and NO win           (a real transaction)
 *   · captured evidence cannot be rewritten or cleared by ANY writer, raw SQL included (the trigger)
 *   · evidence cannot exist on a tender that is not won           (the check constraint)
 *   · a negative or malformed award amount is refused at the persistence boundary (the check)
 *
 * Immutability is not left to service discipline: the write-once store method binds this codebase,
 * the trigger binds a future one, a psql session and an ORM-style full-row update.
 *
 * Gated on CRM_PG_TEST_URL (migrations incl. 0253 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `tender-award-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

const AWARDED_AT = '2026-08-21T07:30:00.000Z';

run('tender award evidence — Postgres immutability + atomicity', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let tx: PostgresTxRunner;
  let store: PostgresTenderStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    tenant = new TenantContext();
    tx = new PostgresTxRunner(pool, tenant);
    store = new PostgresTenderStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_tendering_tenders WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  /** A tender sitting at `submitted`, ready to be awarded. */
  async function seedTender(): Promise<string> {
    const t: Tender = { ...makeTender({ tenantId: TENANT, title: 'PG award tender', value: 800_000 }), status: 'submitted' };
    await store.create(t);
    return t.id;
  }

  /** Fresh-connection read — never the pool the write went through (ACCEPTANCE 12). */
  async function readRaw(id: string) {
    const fresh = new Pool({ connectionString: URL });
    fresh.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    try {
      return (await fresh.query('select status, value, award_evidence from public.aura_tendering_tenders where id=$1', [id])).rows[0];
    } finally { await fresh.end(); }
  }

  const evidence = (over: Record<string, unknown> = {}) => makeTenderAwardEvidence({
    awardedValue: 1_000_000, currency: 'AED', awardedAt: AWARDED_AT, capturedBy: 'u-bid-manager',
    awardReference: 'LOA-2026-31', ...over,
  });

  it('ACCEPTANCE 12: the award persists, and a fresh connection reads back the customer award', async () => {
    const id = await seedTender();
    expect(await store.awardWithClient(null, id, evidence())).toBe(true);

    const row = await readRaw(id);
    expect(row.status).toBe('won');
    expect(row.award_evidence.awardedValue).toBe(1_000_000);
    expect(row.award_evidence.currency).toBe('AED');
    expect(row.award_evidence.awardedAt).toBe(AWARDED_AT);
    expect(row.award_evidence.awardReference).toBe('LOA-2026-31');
    // The estimate is a different concept and is untouched by the award.
    expect(Number(row.value)).toBe(800_000);

    // …and the mapper reads it back as a typed value object, not raw json.
    expect((await store.get(id))!.awardEvidence!.awardedValue).toBe(1_000_000);
  });

  it('ACCEPTANCE 10: a failure inside the award tx leaves NO evidence and NO win', async () => {
    const id = await seedTender();
    await expect(
      tx.run(async (handle) => {
        await store.awardWithClient(handle, id, evidence());
        throw new Error('boom-award-tx');
      }),
    ).rejects.toThrow(/boom-award-tx/);

    const row = await readRaw(id);
    expect(row.status).toBe('submitted');   // never half-won
    expect(row.award_evidence).toBeNull();  // and never a claim of an award that did not commit
  });

  it('THE DATABASE refuses to rewrite captured evidence — even from raw SQL', async () => {
    const id = await seedTender();
    await store.awardWithClient(null, id, evidence());

    const forged = evidence({ awardedValue: 9_999_999, awardReference: 'LOA-FORGED' });
    await expect(
      pool.query('update public.aura_tendering_tenders set award_evidence=$2 where id=$1', [id, JSON.stringify(forged)]),
    ).rejects.toThrow(/immutable once captured/i);

    // …and clearing it is refused too: "cleared" evidence is indistinguishable from evidence that
    // was never captured, which is the exact ambiguity this column removes.
    await expect(
      pool.query('update public.aura_tendering_tenders set award_evidence=null where id=$1', [id]),
    ).rejects.toThrow(/immutable once captured/i);

    expect((await readRaw(id)).award_evidence.awardedValue).toBe(1_000_000);
  });

  it('ACCEPTANCE 9: the write-once method reports a replay instead of overwriting a competing award', async () => {
    const id = await seedTender();
    await store.awardWithClient(null, id, evidence({ awardedValue: 1_000_000 }));

    // `WHERE award_evidence IS NULL` matches no row — no exception, and no change.
    expect(await store.awardWithClient(null, id, evidence({ awardedValue: 5, awardReference: 'LOA-SECOND' }))).toBe(false);
    expect((await readRaw(id)).award_evidence.awardedValue).toBe(1_000_000);
  });

  it('evidence cannot exist on a tender that is not won', async () => {
    const id = await seedTender();
    // Straight past the store method, which would have set status too.
    await expect(
      pool.query("update public.aura_tendering_tenders set award_evidence=$2 where id=$1", [id, JSON.stringify(evidence())]),
    ).rejects.toThrow(/award_evidence_needs_won/i);
    expect((await readRaw(id)).award_evidence).toBeNull();
  });

  it('the persistence boundary refuses a negative or malformed award amount', async () => {
    const id = await seedTender();
    const bad = (patch: Record<string, unknown>) =>
      pool.query("update public.aura_tendering_tenders set status='won', award_evidence=$2 where id=$1",
        [id, JSON.stringify({ ...evidence(), ...patch })]);

    await expect(bad({ awardedValue: -1 })).rejects.toThrow(/award_evidence_value_valid/i);
    await expect(bad({ awardedValue: 'lots' })).rejects.toThrow(/award_evidence_value_valid/i);
    await expect(bad({ currency: '' })).rejects.toThrow(/award_evidence_value_valid/i);
    await expect(bad({ awardedAt: '' })).rejects.toThrow(/award_evidence_value_valid/i);

    // …and THE ZERO RULE holds at the database too: a real 0 is a valid award.
    await pool.query("update public.aura_tendering_tenders set status='won', award_evidence=$2 where id=$1",
      [id, JSON.stringify({ ...evidence(), awardedValue: 0 })]);
    expect((await readRaw(id)).award_evidence.awardedValue).toBe(0);
  });
});
