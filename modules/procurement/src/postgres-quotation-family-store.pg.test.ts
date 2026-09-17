import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresQuotationFamilyStore } from './postgres-quotation-family-store';
import {
  confirmRevision, makeQuotationFamily, makeQuotationOffer, makeQuotationRevision,
} from './domain/quotation-family';

/**
 * QC-01's invariants against REAL PostgreSQL.
 *
 * The API e2e runs on in-memory stores, so everything it proves about the lifecycle is proved against
 * a hand-written map. The invariant that actually protects commercial history is a PARTIAL UNIQUE
 * INDEX, and the ordering that satisfies it is a TRANSACTION — neither of which a map exercises.
 *
 * SUP-01 is the reason this exists: a supersede-before-insert ordering passed twenty in-memory tests
 * and was rejected by the equivalent index the first time it met the database.
 *
 * Skips without a database, and a skip is reported as a skip.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch { /* no env file is a skip, not a failure */ }
  return undefined;
}

describe('the quotation family store (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let store: PostgresQuotationFamilyStore;
  const TENANT = `qc01pg-${Date.now()}`;
  const RFQ = newId();

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    store = new PostgresQuotationFamilyStore(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM public.aura_procurement_quotation_families WHERE tenant_id = $1', [TENANT]);
    await pool.end();
  });

  const dbTest = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => { if (!pool) { ctx.skip(); return; } await body(); });

  /** A family with a base offer and `count` received revisions, ready to confirm. */
  async function seed(supplierName: string, count: number) {
    const family = makeQuotationFamily({ tenantId: TENANT, rfqId: RFQ, supplierName });
    await store.createFamily(family);
    const offer = makeQuotationOffer({ tenantId: TENANT, familyId: family.id });
    await store.createOffer(offer);
    const revisions = [];
    for (let no = 0; no < count; no += 1) {
      const revision = makeQuotationRevision({
        tenantId: TENANT, offerId: offer.id, revisionNo: no, status: 'received',
        currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, freightAmount: no === 2 ? 0 : 500,
      });
      await store.createRevision(revision);
      revisions.push(revision);
    }
    return { family, offer, revisions };
  }

  dbTest('keeps every revision, and lets only one of them be confirmed', async () => {
    const { offer, revisions } = await seed('History Co', 3);

    // Rev 0 → Rev 1 → Rev 2, each confirmation demoting the one before it.
    let current = null;
    for (const next of revisions) {
      const { demote, promote } = confirmRevision(next, current);
      await store.applyConfirmation(demote, promote);
      current = promote;
    }

    const stored = await store.listRevisions(TENANT, offer.id);
    expect(stored).toHaveLength(3);
    expect(stored.filter((r) => r.status === 'confirmed')).toHaveLength(1);
    expect(stored.filter((r) => r.status === 'superseded')).toHaveLength(2);
    expect((await store.findConfirmedRevision(TENANT, offer.id))?.revisionNo).toBe(2);
    // The superseded chain is intact and readable.
    expect(stored.find((r) => r.revisionNo === 2)?.supersedesRevisionId).toBe(revisions[1].id);
  });

  dbTest('REFUSES a second confirmed revision — the invariant is the database’s', async () => {
    const { offer, revisions } = await seed('Two Confirmed Co', 2);
    await store.applyConfirmation(null, { ...revisions[0], status: 'confirmed' });

    // Promoting without demoting is exactly the mistake the index exists to catch.
    await expect(
      store.applyConfirmation(null, { ...revisions[1], status: 'confirmed' }),
    ).rejects.toThrow(/aura_quotation_one_confirmed_revision|duplicate key/);

    // …and the first is untouched, because the transaction rolled back.
    expect((await store.findConfirmedRevision(TENANT, offer.id))?.revisionNo).toBe(0);
  });

  dbTest('lets every NON-confirmed status coexist on one offer', async () => {
    const { offer } = await seed('Coexist Co', 0);
    for (const [no, status] of [[0, 'superseded'], [1, 'withdrawn'], [2, 'rejected'], [3, 'received'], [4, 'draft']] as const) {
      await store.createRevision(makeQuotationRevision({ tenantId: TENANT, offerId: offer.id, revisionNo: no, status }));
    }
    const stored = await store.listRevisions(TENANT, offer.id);
    expect(stored).toHaveLength(5);
    // None of them is effective, and that is a real answer rather than a miss.
    expect(await store.findConfirmedRevision(TENANT, offer.id)).toBeNull();
  });

  dbTest('REFUSES a second base offer, and accepts any number of alternatives', async () => {
    const { family } = await seed('Alternatives Co', 0);
    await expect(store.createOffer(makeQuotationOffer({ tenantId: TENANT, familyId: family.id })))
      .rejects.toThrow(/aura_quotation_offer_one_base|duplicate key/);

    for (const label of ['Bosch equivalent', 'Axis equivalent']) {
      await store.createOffer(makeQuotationOffer({ tenantId: TENANT, familyId: family.id, kind: 'alternative', label }));
    }
    const offers = await store.listOffers(TENANT, family.id);
    expect(offers).toHaveLength(3);
    expect(offers[0].kind).toBe('base');
  });

  dbTest('REFUSES to rewrite a received revision, in the SQL and not only in the service', async () => {
    const { revisions } = await seed('Immutable Co', 1);
    // The predicate carries `AND status = 'draft'`, so a caller that forgets to ask is still refused.
    await expect(store.updateDraftRevision({ ...revisions[0], paymentTerms: '90 days' }))
      .rejects.toThrow(/only a draft revision may be edited/);
  });

  dbTest('does not show one tenant another tenant’s quotations', async () => {
    await seed('Tenant A Co', 1);
    const otherTenant = `${TENANT}-other`;
    const otherPool = new Pool({ connectionString: databaseUrl() });
    otherPool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${otherTenant}', false)`);
    });
    try {
      const other = new PostgresQuotationFamilyStore(otherPool);
      expect(await other.listFamiliesByRfq(otherTenant, RFQ)).toHaveLength(0);
    } finally {
      await otherPool.end();
    }
  });
});
