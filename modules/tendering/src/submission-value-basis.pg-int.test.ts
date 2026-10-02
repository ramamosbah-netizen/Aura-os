import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresSubmissionStore } from './postgres-submission-store';
import { makeTenderSubmission } from './domain/submission';

/**
 * VAT-BASIS-01 — REAL Postgres proof that a submission says what its number is (migration 0404).
 *
 *   · a bid made from an approved offer is read back, on a fresh connection, with its gross value AND
 *     the net and VAT that make it up
 *   · a bid with no approved offer is read back 'unstated', claiming no parts
 *   · the TABLE refuses, whatever writes it: parts that do not add up to the value, an unstated row
 *     that claims parts, a gross row missing a part, and a basis it does not know
 *
 * Gated on CRM_PG_TEST_URL (migrations incl. 0404 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `vat-basis-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('tender submission value basis — Postgres', () => {
  let pool: Pool;
  let store: PostgresSubmissionStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresSubmissionStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_tendering_submissions WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  /** Fresh-connection read — never the pool the write went through. */
  async function readBack(id: string) {
    const fresh = new Pool({ connectionString: URL });
    fresh.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    try {
      return await new PostgresSubmissionStore(fresh).get(id);
    } finally {
      await fresh.end();
    }
  }

  it('an approved offer is read back with its gross, net and VAT', async () => {
    const s = makeTenderSubmission({ tenantId: TENANT, tenderId: crypto.randomUUID(), offer: { net: 117_804, vat: 5_890.2, gross: 123_694.2 } });
    await store.save(s);
    expect(await readBack(s.id)).toMatchObject({ submittedValue: 123_694.2, valueBasis: 'gross', submittedNet: 117_804, submittedVat: 5_890.2 });
  });

  it('a bid with no approved offer is read back unstated, with no parts', async () => {
    const s = makeTenderSubmission({ tenantId: TENANT, tenderId: crypto.randomUUID(), submittedValue: 50_000 });
    await store.save(s);
    expect(await readBack(s.id)).toMatchObject({ submittedValue: 50_000, valueBasis: 'unstated', submittedNet: null, submittedVat: null });
  });

  it('the table refuses a row that misstates its basis, whatever writes it', async () => {
    const insert = (value: number, basis: string, net: number | null, vat: number | null) => pool.query(
      `INSERT INTO public.aura_tendering_submissions (id, tenant_id, tender_id, submitted_value, value_basis, submitted_net, submitted_vat)
       VALUES (gen_random_uuid(), $1, gen_random_uuid(), $2, $3, $4, $5)`, [TENANT, value, basis, net, vat]);
    for (const [value, basis, net, vat] of [
      [106, 'gross', 100, 5],      // parts that do not add up
      [105, 'unstated', 100, 5],   // unstated, claiming parts
      [105, 'gross', 100, null],   // gross, missing its VAT
      [105, 'net', null, null],    // a basis the table does not know
    ] as const) {
      await expect(insert(value, basis, net, vat), `${basis} ${value} = ${net} + ${vat}`).rejects.toThrow('chk_aura_tendering_submission_value_basis');
    }
    await expect(insert(105, 'gross', 100, 5)).resolves.toBeTruthy();
  });
});
