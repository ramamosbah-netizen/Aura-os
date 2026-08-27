import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, PostgresEventStore, TenantContext, AccessService } from '@aura/core';
import { captureQualificationAtAward, makeOpportunity, newId, qualificationRecordFromFlags, type Opportunity } from '@aura/shared';
import { PostgresOpportunityStore } from './postgres-opportunity-store';
import { OpportunityService } from './opportunity.service';

/**
 * ADR-0020 — REAL Postgres proof of the qualification-at-award snapshot.
 *
 * The in-memory suite proves the SERVICE logic; three of these invariants cannot be proven there at
 * all, because they are properties of the database rather than of the code:
 *
 *   · a rolled-back award leaves NO snapshot (needs a real transaction);
 *   · the snapshot cannot be rewritten or cleared, by ANY writer including raw SQL (the trigger);
 *   · a snapshot cannot exist without award provenance (the check constraint).
 *
 * The last two are the reason immutability is not left to service discipline: a dedicated store
 * method binds this codebase, not a future one, and not a psql session.
 *
 * Gated on CRM_PG_TEST_URL (migrations incl. 0251 applied).
 *
 * `update()` is called with a NULL actor on purpose: a truthy actorId makes the service assert
 * `crm.account.create` against the real AccessService, which holds no grants here, so an actor
 * would fail these tests on authorization long before any snapshot invariant was reached.
 * Authorization is proven at the API layer; what is under test here is the database.
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `qual-snap-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('qualification-at-award — Postgres immutability + atomicity', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let tx: PostgresTxRunner;
  let events: PostgresEventStore;
  let opps: PostgresOpportunityStore;
  let opportunities: OpportunityService;

  const info = { tenantId: TENANT, companyId: null, actorId: null, correlationId: null };
  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(info, fn);
  const aiStub = { complete: async () => ({ text: '' }) } as never;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    tenant = new TenantContext();
    tx = new PostgresTxRunner(pool, tenant);
    events = new PostgresEventStore(pool, tenant);
    opps = new PostgresOpportunityStore(pool);
    opportunities = new OpportunityService(opps, events, tx, new AccessService(), aiStub, { classify: async () => 'direct_legacy' as const }, tenant);
  });

  afterAll(async () => {
    for (const t of ['aura_crm_opportunities', 'aura_events']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end().catch(() => undefined);
  });

  async function seedOpp(over: Partial<Opportunity> = {}): Promise<string> {
    const o: Opportunity = { ...makeOpportunity({ tenantId: TENANT, title: 'PG qualification deal', value: 999, executionType: 'direct_sale' }), ...over };
    await tx.run((t) => opps.createWithClient(t, o));
    return o.id;
  }

  /** Fresh-connection read — never the pool the write went through. */
  async function readRaw(oppId: string) {
    const fresh = new Pool({ connectionString: URL });
    fresh.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    try {
      return (await fresh.query(
        'select stage, award_source, awarded_at, qualification, qualification_at_award from public.aura_crm_opportunities where id=$1',
        [oppId],
      )).rows[0];
    } finally { await fresh.end(); }
  }

  const award = (quotationId: string) => ({
    awardedQuotationId: quotationId, contractedValue: 85767, valueSource: 'commercial_baseline' as const,
    reason: 'accepted', source: 'quotation_accepted' as const,
  });

  it('the award persists the snapshot, and a later un-tick moves ONLY the mutable record', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ needConfirmed: true, budgetConfirmed: true });
      await opportunities.applyAwardOutcome(oppId, award(newId()));

      const atAward = await readRaw(oppId);
      expect(atAward.qualification_at_award.version).toBe(1);
      expect(atAward.qualification_at_award.awardSource).toBe('quotation_accepted');
      expect(atAward.qualification_at_award.dimensions.need.status).toBe('CONFIRMED');
      expect(atAward.qualification_at_award.capturedAt).toBe(new Date(atAward.awarded_at).toISOString());

      // Exactly the observed incident, against the real table.
      await opportunities.update(oppId, { needConfirmed: false, budgetConfirmed: false }, null);

      const after = await readRaw(oppId);
      expect(after.qualification.need.status).toBe('UNKNOWN');                  // the record moved
      expect(after.qualification_at_award.dimensions.need.status).toBe('CONFIRMED'); // history did not
      expect(after.qualification_at_award.dimensions.budget.status).toBe('CONFIRMED');
    });
  });

  it('a failed event append inside the award tx leaves NO snapshot and NO award', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ needConfirmed: true });
      const faultyEvents = Object.create(events);
      faultyEvents.appendWithClient = async () => { throw new Error('boom-award-event'); };
      const faultySvc = new OpportunityService(opps, faultyEvents, tx, new AccessService(), aiStub, { classify: async () => 'direct_legacy' as const }, tenant);

      await expect(faultySvc.applyAwardOutcome(oppId, award(newId()))).rejects.toThrow(/boom-award-event/);

      const a = await readRaw(oppId);
      expect(a.stage).not.toBe('won');
      expect(a.award_source).toBeNull();
      // The invariant: never a snapshot claiming an award that did not commit.
      expect(a.qualification_at_award).toBeNull();
    });
  });

  it('THE DATABASE refuses to rewrite a captured snapshot — even from raw SQL', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ needConfirmed: true });
      await opportunities.applyAwardOutcome(oppId, award(newId()));

      const forged = captureQualificationAtAward({
        record: qualificationRecordFromFlags({ budgetConfirmed: true, authorityConfirmed: true, needConfirmed: true, timelineConfirmed: true }),
        awardSource: 'manual_override',
        capturedAt: new Date().toISOString(),
      });

      // Not through the store method — a direct UPDATE, the writer service discipline cannot bind.
      await expect(
        pool.query('update public.aura_crm_opportunities set qualification_at_award = $2 where id = $1', [oppId, JSON.stringify(forged)]),
      ).rejects.toThrow(/immutable once captured/i);

      // …and clearing it is refused too: a "cleared" snapshot is indistinguishable from one that was
      // never captured, which is the exact ambiguity the column removes.
      await expect(
        pool.query('update public.aura_crm_opportunities set qualification_at_award = null where id = $1', [oppId]),
      ).rejects.toThrow(/immutable once captured/i);

      const after = await readRaw(oppId);
      expect(after.qualification_at_award.awardSource).toBe('quotation_accepted');
      expect(after.qualification_at_award.dimensions.budget.status).toBe('UNKNOWN');
    });
  });

  it('the write-once store method reports a replay instead of overwriting', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ budgetConfirmed: true });
      await opportunities.applyAwardOutcome(oppId, award(newId()));

      const second = captureQualificationAtAward({
        record: qualificationRecordFromFlags({ budgetConfirmed: false, authorityConfirmed: false, needConfirmed: false, timelineConfirmed: false }),
        awardSource: 'quotation_accepted',
        capturedAt: new Date().toISOString(),
      });
      // `WHERE qualification_at_award IS NULL` matches no row — no exception, and no change.
      expect(await opps.stampQualificationAtAward(null, oppId, second)).toBe(false);
      expect((await readRaw(oppId)).qualification_at_award.dimensions.budget.status).toBe('CONFIRMED');
    });
  });

  it('a snapshot cannot exist without award provenance', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ needConfirmed: true }); // open: award_source is null
      const snapshot = captureQualificationAtAward({
        record: qualificationRecordFromFlags({ budgetConfirmed: true, authorityConfirmed: false, needConfirmed: true, timelineConfirmed: false }),
        awardSource: 'quotation_accepted',
        capturedAt: new Date().toISOString(),
      });
      // The DB statement of "stage = 'won' is not the trigger": no provenance, no history.
      await expect(opps.stampQualificationAtAward(null, oppId, snapshot))
        .rejects.toThrow(/qualification_at_award_needs_provenance/i);
      expect((await readRaw(oppId)).qualification_at_award).toBeNull();
    });
  });

  it('a LEGACY manual close captures nothing, and the deal reads "not captured"', async () => {
    await withTenant(async () => {
      const oppId = await seedOpp({ stage: 'negotiation', budgetConfirmed: true, needConfirmed: true });
      await opportunities.update(oppId, { stage: 'won', winReason: 'verbal go-ahead' }, null);

      const a = await readRaw(oppId);
      expect(a.stage).toBe('won');
      expect(a.award_source).toBeNull();
      expect(a.qualification_at_award).toBeNull();
      // And the entity reads it back as null rather than fabricating one from the live record.
      expect((await opps.get(oppId))!.qualificationAtAward).toBeNull();
    });
  });
});
