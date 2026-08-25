import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, PostgresEventStore, TenantContext, AccessService } from '@aura/core';
import { makeOpportunity, newId, type Opportunity } from '@aura/shared';
import { PostgresOpportunityStore } from './postgres-opportunity-store';
import { PostgresQuotationStore } from './postgres-quotation-store';
import { PostgresPricingSheetStore } from './postgres-pricing-sheet-store';
import { PostgresPreAwardPackageStore } from './postgres-pre-award-package-store';
import { PostgresCommercialBaselineStore } from './postgres-commercial-baseline-store';
import { OpportunityService } from './opportunity.service';
import { PreAwardGovernanceResolver } from './opportunity-governance';
import { QuotationService } from './quotation.service';
import { PreAwardPackageService } from './pre-award-package.service';
import { PricingQuotationService } from './pricing-quotation.service';
import { openCommercialPricing, applyPricingPolicy } from './domain/pricing-sheet';

/**
 * Slice 9 PR-1 — REAL Postgres proof of the accept→Won award: authoritative value, provenance,
 * transactional atomicity, and identity conflict — verified from a fresh connection.
 * Gated on CRM_PG_TEST_URL (migrations incl. 0248/0249/0250 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `award-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('opportunity award — Postgres persistence + atomicity', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let tx: PostgresTxRunner;
  let events: PostgresEventStore;
  let opps: PostgresOpportunityStore;
  let quoteStore: PostgresQuotationStore;
  let pricing: PostgresPricingSheetStore;
  let opportunities: OpportunityService;
  let govOpportunities: OpportunityService; // wired with the REAL PreAwardGovernanceResolver
  let quotations: QuotationService;
  let packages: PreAwardPackageService;
  let materialiser: PricingQuotationService;

  const info = { tenantId: TENANT, companyId: null, actorId: null, correlationId: null };
  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(info, fn);

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    tenant = new TenantContext();
    tx = new PostgresTxRunner(pool, tenant);
    events = new PostgresEventStore(pool, tenant);
    opps = new PostgresOpportunityStore(pool);
    quoteStore = new PostgresQuotationStore(pool);
    pricing = new PostgresPricingSheetStore(pool);
    const access = new AccessService();
    opportunities = new OpportunityService(opps, events, tx, access, { complete: async () => ({ text: '' }) } as never, { classify: async () => 'direct_legacy' as const }, tenant);
    govOpportunities = new OpportunityService(opps, events, tx, access, { complete: async () => ({ text: '' }) } as never, new PreAwardGovernanceResolver(new PostgresPreAwardPackageStore(pool)), tenant);
    quotations = new QuotationService(quoteStore, new PostgresCommercialBaselineStore(pool), events, access, tenant);
    packages = new PreAwardPackageService(new PostgresPreAwardPackageStore(pool), pricing, tx);
    materialiser = new PricingQuotationService(pricing, quoteStore, events, packages, tx);
  });

  afterAll(async () => {
    for (const t of ['aura_crm_quotations', 'aura_crm_commercial_baselines', 'aura_crm_pricing_sheets', 'aura_crm_pre_award_packages', 'aura_crm_opportunities', 'aura_events']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end().catch(() => undefined);
  });

  async function seedOpp(over: Partial<Opportunity> = {}): Promise<string> {
    const o: Opportunity = { ...makeOpportunity({ tenantId: TENANT, title: 'PG award deal', value: 999, executionType: 'direct_sale' }), ...over };
    await tx.run((t) => opps.createWithClient(t, o));
    return o.id;
  }

  /** Governed deal → frozen P-001 → materialise Q → approve (locks baseline) → send. Returns the quote + baseline subtotal. */
  async function toSent(oppId: string): Promise<{ quoteId: string; awardedValue: number }> {
    const pkg = await packages.openDirect({ tenantId: TENANT, opportunityId: oppId });
    const draft = openCommercialPricing({ tenantId: TENANT, name: 'P', opportunityId: oppId, packageId: pkg.id, estimateRevisionId: null as unknown as string, baselineCost: 1000, version: 1, parentSheetId: null, createdBy: 'u1' });
    await pricing.save(applyPricingPolicy(draft, { method: 'markup', percent: 20 }, null));
    await packages.freezePricingSheetById({ tenantId: TENANT, opportunityId: oppId, sheetId: draft.id, actorId: 'u1' });
    const q = await materialiser.materialise({ tenantId: TENANT, opportunityId: oppId, customerName: 'Emaar', actorId: 'u1' });
    await quotations.changeStatus(q.id, 'approve', null);
    await quotations.changeStatus(q.id, 'send', null);
    const baseline = await quotations.getBaseline(TENANT, q.id);
    return { quoteId: q.id, awardedValue: baseline!.subtotal };
  }

  /** Fresh-connection read of the opportunity award columns. */
  async function readAward(oppId: string) {
    const fresh = new Pool({ connectionString: URL });
    fresh.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    try {
      const r = (await fresh.query('select stage, value::text, contracted_value::text, awarded_quotation_id::text, award_source, awarded_at from public.aura_crm_opportunities where id=$1', [oppId])).rows[0];
      return r;
    } finally { await fresh.end(); }
  }

  it('accept → Won with authoritative value + provenance, persisted (fresh connection), no contract, idempotent', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      const { quoteId, awardedValue } = await toSent(oppId);
      await quotations.changeStatus(quoteId, 'accept', null);

      // resolve exactly as the reactor does, then run the sanctioned command
      const r = await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: quoteId, contractedValue: awardedValue, valueSource: 'commercial_baseline', reason: 'accepted', source: 'quotation_accepted' });
      expect(r.outcome).toBe('won');

      const a = await readAward(oppId);
      expect(a.stage).toBe('won');
      expect(Number(a.contracted_value)).toBe(awardedValue);   // baseline subtotal
      expect(Number(a.value)).toBe(999);                        // headline untouched
      expect(a.awarded_quotation_id).toBe(quoteId);
      expect(a.award_source).toBe('quotation_accepted');
      expect(a.awarded_at).toBeTruthy();

      // no contract was created by the award
      const contracts = await pool.query("select count(*)::int as n from public.aura_contracts where tenant_id=$1", [TENANT]).catch(() => ({ rows: [{ n: 0 }] }));
      expect(contracts.rows[0].n).toBe(0);

      // idempotent replay of the SAME award
      expect((await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: quoteId, contractedValue: awardedValue, valueSource: 'commercial_baseline', reason: 'accepted', source: 'quotation_accepted' })).outcome).toBe('noop_same_award');
    });
  });

  it('a failed event append inside the award tx rolls the WHOLE close back (fresh-connection read)', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      // an OpportunityService whose event append throws inside the tx
      const faultyEvents = Object.create(events);
      faultyEvents.appendWithClient = async () => { throw new Error('boom-award-event'); };
      const faultySvc = new OpportunityService(opps, faultyEvents, tx, new AccessService(), { complete: async () => ({ text: '' }) } as never, { classify: async () => 'direct_legacy' as const }, tenant);
      await expect(faultySvc.applyAwardOutcome(oppId, { awardedQuotationId: newId(), contractedValue: 1200, valueSource: 'commercial_baseline', reason: 'x', source: 'quotation_accepted' })).rejects.toThrow(/boom-award-event/);
      const a = await readAward(oppId);
      expect(a.stage).not.toBe('won');           // the close rolled back with the failed event
      expect(a.awarded_quotation_id).toBeNull();
    });
  });

  it('a DIFFERENT quotation award on an already-won deal is a conflict — never overwrites (fresh read)', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      const q2 = newId(), q3 = newId();
      await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: q2, contractedValue: 85767, valueSource: 'commercial_baseline', reason: 'a', source: 'quotation_accepted' });
      const r = await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: q3, contractedValue: 91500, valueSource: 'commercial_baseline', reason: 'b', source: 'quotation_accepted' });
      expect(r.outcome).toBe('award_conflict');
      const a = await readAward(oppId);
      expect(a.awarded_quotation_id).toBe(q2);                 // NOT overwritten
      expect(Number(a.contracted_value)).toBe(85767);
      const conflicts = await pool.query("select count(*)::int as n from public.aura_events where tenant_id=$1 and type='crm.opportunity.award_conflict'", [TENANT]);
      expect(conflicts.rows[0].n).toBe(1);
    });
  });

  it('manual override → Won atomically, persisted (fresh read), with audit + warning; value not promoted', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp(); // value 999
      const r = await opportunities.overrideAwardOutcome(oppId, { reason: 'PO received by email', contractedValue: 50000, evidenceReference: 'PO-4471', actorId: 'u-mgr' });
      expect(r.stage).toBe('won');
      const a = await readAward(oppId);
      expect(a.award_source).toBe('manual_override');
      expect(Number(a.contracted_value)).toBe(50000);   // exactly entered
      expect(Number(a.value)).toBe(999);                 // forecast NOT promoted
      expect(a.awarded_quotation_id).toBeNull();         // no authoritative quotation
      const audit = await pool.query("select payload from public.aura_events where tenant_id=$1 and type='crm.opportunity.award_override'", [TENANT]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].payload).toMatchObject({ warning: 'No authoritative accepted quotation', evidenceReference: 'PO-4471', contractedValue: 50000 });
    });
  });

  it('a failed audit append inside the override tx rolls the WHOLE override back — BEFORE===AFTER (fresh read)', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      const eventsBefore = (await events.list({ tenantId: TENANT, aggregateId: oppId })).length;
      const faultyEvents = Object.create(events);
      faultyEvents.appendWithClient = async () => { throw new Error('boom-override-audit'); };
      const faultySvc = new OpportunityService(opps, faultyEvents, tx, new AccessService(), { complete: async () => ({ text: '' }) } as never, { classify: async () => 'direct_legacy' as const }, tenant);
      await expect(faultySvc.overrideAwardOutcome(oppId, { reason: 'x', contractedValue: 1, actorId: 'u-mgr' })).rejects.toThrow(/boom-override-audit/);
      const a = await readAward(oppId);
      expect(a.stage).not.toBe('won');       // opportunity rolled back
      expect(a.award_source).toBeNull();
      // no stage_changed and no award_override event survived — the whole unit rolled back together
      expect((await events.list({ tenantId: TENANT, aggregateId: oppId })).length).toBe(eventsBefore);
    });
  });

  // #3 — the REAL governance relation, on real Postgres: package present ⇒ generic Won refused.
  it('real resolver (PG): package ⇒ direct_governed ⇒ generic Won rejected; no package ⇒ direct_legacy ⇒ allowed', async () => {
    await withTenant(async () => {
      const governed = await seedOpp();
      await packages.openDirect({ tenantId: TENANT, opportunityId: governed }); // the authoritative relation
      await expect(govOpportunities.update(governed, { stage: 'won', winReason: 'x' }, null)).rejects.toThrow(/governed/i);
      expect((await readAward(governed)).stage).not.toBe('won');

      const legacy = await seedOpp(); // no package
      const r = await govOpportunities.update(legacy, { stage: 'won', winReason: 'legacy win' }, null);
      expect(r.stage).toBe('won');
    });
  });

  // Slice 9 fix — the conflict is SYMMETRIC and REPLAY-SAFE, proven on real Postgres.
  it('quotation award then manual override → rejected, award kept, durable conflict recorded ONCE (fresh read)', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      const q = newId();
      await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: q, contractedValue: 85767, valueSource: 'commercial_baseline', reason: 'accepted', source: 'quotation_accepted' });
      // Retry the override three times — each rejects, and only ONE conflict is ever recorded.
      for (let i = 0; i < 3; i++) {
        await expect(opportunities.overrideAwardOutcome(oppId, { reason: 'boss said so', actorId: 'u-mgr' })).rejects.toThrow(/already won from an authoritative award/i);
      }
      const a = await readAward(oppId);
      expect(a.award_source).toBe('quotation_accepted');   // override never overwrote the award
      expect(a.awarded_quotation_id).toBe(q);
      const c = await pool.query("select payload from public.aura_events where tenant_id=$1 and aggregate_id=$2 and type='crm.opportunity.award_conflict' order by occurred_at", [TENANT, oppId]);
      expect(c.rows).toHaveLength(1);                        // durable + deduped by actor
      expect(c.rows[0].payload).toMatchObject({ attemptedSource: 'manual_override', existingAwardSource: 'quotation_accepted' });
    });
  });

  it('manual override then a redelivered conflicting award → one conflict, override kept (fresh read)', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp();
      await opportunities.overrideAwardOutcome(oppId, { reason: 'offline PO', contractedValue: 50000, actorId: 'u-mgr' });
      const q = newId();
      for (let i = 0; i < 3; i++) {
        const r = await opportunities.applyAwardOutcome(oppId, { awardedQuotationId: q, contractedValue: 85767, valueSource: 'commercial_baseline', reason: 'accepted', source: 'quotation_accepted' });
        expect(r.outcome).toBe('award_conflict');
      }
      const a = await readAward(oppId);
      expect(a.award_source).toBe('manual_override');       // override stands
      expect(Number(a.contracted_value)).toBe(50000);
      const c = await pool.query("select payload from public.aura_events where tenant_id=$1 and aggregate_id=$2 and type='crm.opportunity.award_conflict' order by occurred_at", [TENANT, oppId]);
      expect(c.rows).toHaveLength(1);                        // deduped by incoming quotation identity
      expect(c.rows[0].payload).toMatchObject({ attemptedSource: 'quotation_accepted', incomingQuotationId: q });
    });
  });
});
