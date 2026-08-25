import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, PostgresEventStore, TenantContext, type TxHandle } from '@aura/core';
import { newId, makeOpportunity } from '@aura/shared';
import { PostgresPricingSheetStore } from './postgres-pricing-sheet-store';
import { PostgresQuotationStore } from './postgres-quotation-store';
import { PostgresPreAwardPackageStore } from './postgres-pre-award-package-store';
import { PostgresOpportunityStore } from './postgres-opportunity-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { PricingQuotationService } from './pricing-quotation.service';
import { openCommercialPricing, applyPricingPolicy, type PricingSheet } from './domain/pricing-sheet';
import type { PricingSheetStore } from './pricing-sheet-store';

/**
 * Slice 8 PR-2 — REAL Postgres proof of the pricing → quotation revision loop.
 *
 * The in-memory suite proves LOGIC; it cannot prove ATOMICITY (NullTxRunner never rolls back). These
 * tests prove, on a live database, that (1) PostgresTxRunner threads ONE PoolClient through the
 * pricing, quotation AND event writes, (2) the whole negotiation chain behaves by pricing-revision
 * identity, and (3) a failure INSIDE the transaction rolls every write back with no partial state.
 *
 * Gated on CRM_PG_TEST_URL; the DB must have the CRM migrations applied incl. 0248 + 0249.
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `pq-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('pricing → quotation revision — Postgres atomicity + chain', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let tx: PostgresTxRunner;
  let events: PostgresEventStore;
  let pricing: PostgresPricingSheetStore;
  let quotes: PostgresQuotationStore;
  let packages: PreAwardPackageService;
  let svc: PricingQuotationService;
  let opps: PostgresOpportunityStore;

  const info = { tenantId: TENANT, companyId: null, actorId: null, correlationId: null };
  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(info, fn);

  /** Seed a real opportunity (the pre-award package has an FK to it) and return its id. Call inside withTenant. */
  const seedOpp = async (): Promise<string> => {
    const o = makeOpportunity({ tenantId: TENANT, title: 'PG chain deal', value: 1000 });
    await tx.run((t) => opps.createWithClient(t, o));
    return o.id;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    tenant = new TenantContext();
    tx = new PostgresTxRunner(pool, tenant);
    events = new PostgresEventStore(pool, tenant);
    pricing = new PostgresPricingSheetStore(pool);
    quotes = new PostgresQuotationStore(pool);
    packages = new PreAwardPackageService(new PostgresPreAwardPackageStore(pool), pricing, tx);
    svc = new PricingQuotationService(pricing, quotes, events, packages, tx);
    opps = new PostgresOpportunityStore(pool);
  });

  afterAll(async () => {
    // FK order: quotations & pricing sheets → packages → opportunities; events last.
    for (const t of ['aura_crm_quotations', 'aura_crm_pricing_sheets', 'aura_crm_pre_award_packages', 'aura_crm_opportunities', 'aura_events']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end().catch(() => undefined);
  });

  /** Save a priced draft then freeze it (freeze supersedes the prior current frozen, atomically). */
  async function seedFrozen(opp: string, pkgId: string, version: number, parentSheetId: string | null): Promise<PricingSheet> {
    const draft = openCommercialPricing({
      tenantId: TENANT, name: 'PG chain', opportunityId: opp, packageId: pkgId,
      estimateRevisionId: null as unknown as string, baselineCost: 1000, version, parentSheetId, createdBy: 'u1',
    });
    await pricing.save(applyPricingPolicy(draft, { method: 'markup', percent: 20 }, null));
    return packages.freezePricingSheetById({ tenantId: TENANT, opportunityId: opp, sheetId: draft.id, actorId: 'u1' });
  }
  const gen = (opp: string) => svc.materialise({ tenantId: TENANT, opportunityId: opp, customerName: 'Emaar', accountId: newId(), actorId: 'u1' });

  it('threads ONE PoolClient through pricing + quotation + event writes in a materialise', async () => {
    await withTenant(async () => {
      const opp = await seedOpp();
      const pkg = await packages.openDirect({ tenantId: TENANT, opportunityId: opp });
      const p1 = await seedFrozen(opp, pkg.id, 1, null);
      await gen(opp); // Q-001 (rev 0)
      const p2 = await seedFrozen(opp, pkg.id, 2, p1.id);

      // Instrument the three writers to record the tx handle they receive during the Q-002 materialise.
      const seen: Record<string, TxHandle | null> = {};
      const realQ = quotes.saveWithClient.bind(quotes);
      const realP = pricing.saveWithClient.bind(pricing);
      const realE = events.appendWithClient.bind(events);
      quotes.saveWithClient = async (h, q) => { seen.quote = h; return realQ(h, q); };
      pricing.saveWithClient = async (h, s) => { seen.pricing = h; return realP(h, s); };
      events.appendWithClient = async (h, e) => { seen.event = h; return realE(h, e); };
      try {
        await gen(opp); // Q-002 revision — touches all three writers inside ONE tx.run
      } finally {
        quotes.saveWithClient = realQ; pricing.saveWithClient = realP; events.appendWithClient = realE;
      }
      expect(p2.version).toBe(2);
      expect(seen.quote).not.toBeNull();
      // The SAME PoolClient object reached quotation, pricing AND event append — proof of one tx.
      expect(seen.pricing).toBe(seen.quote);
      expect(seen.event).toBe(seen.quote);
    });
  });

  it('drives the full chain: P-001→Q-001, freeze P-002→historical + Q-002 revision, P-003→Q-003 (identity, not numbers)', async () => {
    await withTenant(async () => {
      const opp = await seedOpp();
      const pkg = await packages.openDirect({ tenantId: TENANT, opportunityId: opp });

      const p1 = await seedFrozen(opp, pkg.id, 1, null);
      const q1 = await gen(opp);
      expect(q1.revision).toBe(0);
      expect(q1.subtotal).toBe(p1.totals.totalSell);          // money from the sheet, never opportunity.value
      expect((await pricing.get(p1.id))!.quotationId).toBe(q1.id);
      expect((await gen(opp)).id).toBe(q1.id);                 // idempotent by identity

      // P-002 draft leaves P-001 current
      const d2 = openCommercialPricing({ tenantId: TENANT, name: 'PG chain', opportunityId: opp, packageId: pkg.id, estimateRevisionId: null as unknown as string, baselineCost: 1000, version: 2, parentSheetId: p1.id, createdBy: 'u1' });
      await pricing.save(applyPricingPolicy(d2, { method: 'markup', percent: 20 }, null));
      expect((await packages.frozenPricingFor(TENANT, opp))!.id).toBe(p1.id);

      // freeze P-002 → P-001 historical (read superseded_by_pricing_id back from PG)
      const p2 = await packages.freezePricingSheetById({ tenantId: TENANT, opportunityId: opp, sheetId: d2.id, actorId: 'u1' });
      expect((await pricing.get(p1.id))!.supersededByPricingId).toBe(p2.id);
      expect((await packages.frozenPricingFor(TENANT, opp))!.id).toBe(p2.id);

      // Generate → Q-002 revision of Q-001
      const q2 = await gen(opp);
      expect(q2.revision).toBe(1);
      expect(q2.parentQuotationId).toBe(q1.id);
      expect(q2.subtotal).toBe(p2.totals.totalSell);
      expect((await quotes.get(q1.id))!.status).toBe('revised');
      expect((await pricing.get(p2.id))!.quotationId).toBe(q2.id);
      expect((await gen(opp)).id).toBe(q2.id);                 // same Q-002 again

      // P-003 identical numbers → NEW Q-003 (identity drives it, not totals)
      const p3 = await seedFrozen(opp, pkg.id, 3, p2.id);
      expect(p3.totals.totalSell).toBe(p2.totals.totalSell);
      const q3 = await gen(opp);
      expect(q3.revision).toBe(2);
      expect(q3.parentQuotationId).toBe(q2.id);
      expect((await quotes.get(q2.id))!.status).toBe('revised');
      expect((await quotes.list({ tenantId: TENANT, sourceOpportunityId: opp })).length).toBe(3);
    });
  });

  it('a failure INSIDE the tx (after a real write) rolls EVERYTHING back — full snapshot equal via a FRESH connection', async () => {
    let opp = '';
    // A completely independent pool/connection — proves the rollback is durable at the DB, not just a
    // stale view on the writer's client.
    const freshPool = new Pool({ connectionString: URL });
    freshPool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });

    /** Full commercial snapshot for the deal, read on the FRESH connection. */
    const snapshot = async () => {
      const sheets = (await freshPool.query(
        'select id, status, superseded_at, superseded_by_pricing_id, quotation_id from public.aura_crm_pricing_sheets where tenant_id=$1 and opportunity_id=$2 order by version',
        [TENANT, opp])).rows;
      const qs = (await freshPool.query(
        'select id, revision, parent_quotation_id, status from public.aura_crm_quotations where tenant_id=$1 and source_opportunity_id=$2 order by revision',
        [TENANT, opp])).rows;
      const ev = (await freshPool.query('select count(*)::int as n from public.aura_events where tenant_id=$1', [TENANT])).rows[0].n as number;
      return { sheets, qs, ev };
    };

    try {
      const p1id = await withTenant(async () => {
        opp = await seedOpp();
        const pkg = await packages.openDirect({ tenantId: TENANT, opportunityId: opp });
        const p1 = await seedFrozen(opp, pkg.id, 1, null);
        await gen(opp); // Q-001
        const d2 = openCommercialPricing({ tenantId: TENANT, name: 'PG chain', opportunityId: opp, packageId: pkg.id, estimateRevisionId: null as unknown as string, baselineCost: 1000, version: 2, parentSheetId: p1.id, createdBy: 'u1' });
        await pricing.save(applyPricingPolicy(d2, { method: 'markup', percent: 20 }, null));
        await packages.freezePricingSheetById({ tenantId: TENANT, opportunityId: opp, sheetId: d2.id, actorId: 'u1' });
        return p1.id;
      });

      const before = await snapshot();

      // Inject a failure AFTER a real write inside the tx: the quote insert + Q-001 revise + events
      // have executed on the SAME tx client; the pricing→quote LINK throws → the whole tx rolls back.
      const faulty: PricingSheetStore = Object.create(pricing);
      faulty.saveWithClient = async (h: TxHandle | null, s: PricingSheet) => {
        if (s.quotationId) throw new Error('boom-link');
        return pricing.saveWithClient(h, s);
      };
      const svcFaulty = new PricingQuotationService(faulty, quotes, events, packages, tx);
      await withTenant(() =>
        expect(svcFaulty.materialise({ tenantId: TENANT, opportunityId: opp, customerName: 'Emaar', actorId: 'u1' })).rejects.toThrow(/boom-link/),
      );

      const after = await snapshot();
      // BEFORE === AFTER, exactly: no orphan Q, no partial quotationId link, no wrongly-superseded prior,
      // pricing effectivity unchanged, no partial event.
      expect(after).toEqual(before);
      expect(p1id).toBeTruthy();
    } finally {
      await freshPool.end().catch(() => undefined);
    }
  });
});
