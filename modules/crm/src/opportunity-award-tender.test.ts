import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService } from '@aura/core';
import {
  CRM_EVENT, buildDealFacts, makeOpportunity, resolveDealOutcome, resolveQualificationProvenance,
  type Opportunity,
} from '@aura/shared';
import { OpportunityService, type TenderAwardProvenance } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

/**
 * ADR-0020 follow-up — TENDER AWARD PROVENANCE.
 *
 * `applyTenderOutcome` used to close a tender-route deal Won while stamping nothing: no
 * `awardSource`, no `contractedValue`, no `awardedAt`. Every tender win therefore read `LEGACY_WON`
 * ("Won — award not evidenced") and captured no qualification-at-award snapshot, even though the
 * tender award is itself the authoritative record.
 *
 * The fix is not "set awardSource" — that alone would flip `awardDocumented` to true while
 * `contractedValue` stayed null, which `resolveDealOutcome` documents as a real inconsistency that
 * must stay visible, and which every money surface keying on `awardDocumented` would then surface.
 * Provenance and its number travel together or not at all, and these tests hold that line from both
 * directions.
 */

const aiStub = { complete: async () => ({ text: '' }) } as never;

/**
 * `updateQualification` is authorized (`crm.opportunity.update`, ADR-0020), so the actor these specs
 * name needs a real grant. The guard is satisfied, not bypassed — its own refusal cases live in
 * opportunity-qualification-snapshot.test.ts.
 */
const ACTOR = 'u-admin';

function build() {
  const store = new InMemoryOpportunityStore();
  const events = new InMemoryEventStore(new EventBus());
  const access = new AccessService();
  access.seedStandardRoles();
  access.grant({ userId: ACTOR, roleId: 'r-sales', scope: { kind: 'org', level: 'tenant', id: 't1' } });
  const svc = new OpportunityService(store, events, new NullTxRunner(), access, aiStub, { classify: async () => 'tender_owned' as const });
  return { store, events, svc };
}

/** A tender-route deal with a HEADLINE value that must never be mistaken for a contracted value. */
async function seedTenderDeal(store: InMemoryOpportunityStore, over: Partial<Opportunity> = {}): Promise<Opportunity> {
  const opp: Opportunity = {
    ...makeOpportunity({ tenantId: 't1', title: 'Airport CCTV', value: 1_250_000, executionType: 'tender' }),
    tenderId: 'tnd-1',
    requiresTender: true,
    ...over,
  };
  await store.create(opp);
  return opp;
}

/** The award decision time. Deliberately well in the past, so "this is not a `now()` stamp" is provable. */
const AWARDED_AT = '2026-08-20T09:15:00.000Z';

// ADR-0021 — provenance is the CUSTOMER'S award evidence. The commercial baseline is no longer a
// source for this number: it is the offer basis behind the contract, a different concept.
const provenance = (over: Partial<TenderAwardProvenance> = {}): TenderAwardProvenance => ({
  contractedValue: 987_654,
  awardedAt: AWARDED_AT,
  valueSource: 'customer_award_evidence',
  currency: 'AED',
  awardReference: 'LOA-2026-31',
  evidenceDocumentId: null,
  ...over,
});

describe('applyTenderOutcome — award provenance', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  // INVARIANT 6 (ADR-0021), as a regression test rather than an accident of the surrounding flow.
  // `awardedQuotationId` means "the exact accepted quotation revision the customer awarded". On the
  // tender route the customer awarded the TENDER, so it must be null — and it must be null BECAUSE
  // the award path states it, not because nothing happened to write it. The seed deliberately
  // pre-loads a stale value so a path that merely omits the field would FAIL here.
  it('INVARIANT 6: the tender award path explicitly clears awardedQuotationId', async () => {
    const opp = await seedTenderDeal(store);
    // A stale quotation reference sitting on the record before the tender award lands.
    await store.update({ ...(await store.get(opp.id))!, awardedQuotationId: 'q-stale-999' });

    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won on tender TND-1', award: provenance() });

    const stored = (await store.get(opp.id))!;
    expect(stored.awardSource).toBe('tender_award');
    expect(stored.awardedQuotationId).toBeNull();   // stated by the award path, not left over
    // …and the snapshot agrees: history cannot name a quotation revision that was never awarded.
    expect(stored.qualificationAtAward!.awardedQuotationId).toBeNull();
  });

  it('stamps tender_award provenance + the authoritative value, and the win becomes GOVERNED_WON', async () => {
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won on tender TND-1', value: 900_000, award: provenance() });

    const stored = (await store.get(opp.id))!;
    expect(stored.stage).toBe('won');
    expect(stored.awardSource).toBe('tender_award');
    expect(stored.contractedValue).toBe(987_654);
    expect(stored.awardedAt).toBe(AWARDED_AT);

    const outcome = resolveDealOutcome(stored);
    expect(outcome.state).toBe('GOVERNED_WON');
    expect(outcome.awardDocumented).toBe(true);
    expect(outcome.awardValue).toBe(987_654);
  });

  it('the award timestamp is the tender AWARD decision, never the reactor calling now()', async () => {
    const opp = await seedTenderDeal(store);
    const before = new Date().toISOString();
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });

    const stored = (await store.get(opp.id))!;
    // The award predates this test run; a `now()` stamp could not possibly produce it.
    expect(stored.awardedAt).toBe(AWARDED_AT);
    expect(stored.awardedAt! < before).toBe(true);
    // `updatedAt` IS this write's own clock — the two are different facts and must not be conflated.
    expect(stored.updatedAt).not.toBe(stored.awardedAt);
  });

  it('does NOT leak the opportunity headline value into contractedValue (nor the tender estimate)', async () => {
    const opp = await seedTenderDeal(store, { value: 1_250_000 });
    // `value: 900_000` is the TENDER's estimate, the reactor's fallback for an empty headline.
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', value: 900_000, award: provenance({ contractedValue: 987_654 }) });

    const stored = (await store.get(opp.id))!;
    expect(stored.contractedValue).toBe(987_654);      // the approved baseline — the only authority
    expect(stored.contractedValue).not.toBe(1_250_000); // NOT the salesperson's headline
    expect(stored.contractedValue).not.toBe(900_000);   // NOT the tender's estimated bid value
    expect(stored.value).toBe(1_250_000);               // headline untouched by the award
  });

  it('carries the value on a deal that had NO headline, and still keeps the two numbers apart', async () => {
    const opp = await seedTenderDeal(store, { value: 0 });
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', value: 900_000, award: provenance({ contractedValue: 987_654 }) });

    const stored = (await store.get(opp.id))!;
    expect(stored.value).toBe(900_000);            // headline backfilled from the tender estimate…
    expect(stored.contractedValue).toBe(987_654);  // …which is still NOT the contracted value
  });

  it('captures the qualification-at-award snapshot BY CONSTRUCTION — provenance is the only gate', async () => {
    const opp = await seedTenderDeal(store);
    await svc.updateQualification(opp.id, { budget: { status: 'CONFIRMED', evidence: 'Client budget letter' } }, ACTOR);

    const won = await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });

    const snapshot = won.qualificationAtAward!;
    expect(snapshot).toBeTruthy();
    expect(snapshot.awardSource).toBe('tender_award');
    // The customer awarded the TENDER, not a quotation revision — the field means the latter.
    expect(snapshot.awardedQuotationId).toBeNull();
    // Stamped with the award's own timestamp, so the snapshot and `awardedAt` can never disagree.
    expect(snapshot.capturedAt).toBe(AWARDED_AT);
    expect(snapshot.dimensions.budget.status).toBe('CONFIRMED');
    expect(snapshot.dimensions.budget.evidence).toBe('Client budget letter');
    expect((await store.get(opp.id))!.qualificationAtAward).toEqual(snapshot);
  });

  it('the snapshot is HISTORY: editing qualification after the award cannot move it', async () => {
    const opp = await seedTenderDeal(store);
    await svc.updateQualification(opp.id, { need: { status: 'CONFIRMED', evidence: 'Scope signed off' } }, ACTOR);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });

    // The exact 2026-08-26 defect, on the tender route: un-tick a dimension AFTER the award.
    await svc.updateQualification(opp.id, { need: { status: 'UNKNOWN' } }, ACTOR);

    const stored = (await store.get(opp.id))!;
    expect(stored.qualification!.need.status).toBe('UNKNOWN');            // current record moved…
    expect(stored.qualificationAtAward!.dimensions.need.status).toBe('CONFIRMED'); // …history did not
    const provenanceRead = resolveQualificationProvenance({ terminal: true, atAward: stored.qualificationAtAward });
    expect(provenanceRead.kind).toBe('AT_AWARD');
  });

  it('emits the capture event alongside the stage change, with the money provenance on the wire', async () => {
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });

    const stage = (await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityStageChanged })).at(-1)!;
    expect(stage.payload).toMatchObject({
      stage: 'won',
      awardSource: 'tender_award',
      contractedValue: 987_654,
      // ADR-0021 — the CUSTOMER's award facts on the wire. The commercial baseline is deliberately
      // absent: it is the offer basis behind the contract, not evidence of what the customer awarded.
      valueSource: 'customer_award_evidence',
      awardCurrency: 'AED',
      awardReference: 'LOA-2026-31',
      viaTender: 'tnd-1',
    });
    const captured = await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityQualificationCaptured });
    expect(captured).toHaveLength(1);
    expect(captured[0].payload).toMatchObject({ awardSource: 'tender_award', awardedQuotationId: null, capturedAt: AWARDED_AT });
  });
});

describe('applyTenderOutcome — the both-or-neither invariant (negative controls)', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  it('a tender win can NEVER be awardDocumented with a missing contracted value', async () => {
    // Every way a caller can close a tender deal Won, including the unevidenced ones.
    const cases: Array<{ name: string; detail: { reason: string; value?: number; award?: TenderAwardProvenance | null } }> = [
      { name: 'no award key at all', detail: { reason: 'Won', value: 900_000 } },
      { name: 'award explicitly null', detail: { reason: 'Won', value: 900_000, award: null } },
      { name: 'award with a real value', detail: { reason: 'Won', value: 900_000, award: provenance() } },
      { name: 'award with a zero value', detail: { reason: 'Won', award: provenance({ contractedValue: 0 }) } },
    ];
    for (const c of cases) {
      const { store: s, svc: v } = build();
      const opp = await seedTenderDeal(s);
      await v.applyTenderOutcome(opp.id, 'won', c.detail);
      const outcome = resolveDealOutcome((await s.get(opp.id))!);
      // THE invariant: documented ⇒ the number is there. Never one without the other.
      expect(outcome.awardDocumented && outcome.awardValue == null, c.name).toBe(false);
    }
  });

  it('no approved baseline ⇒ NO provenance and NO snapshot — the win stays honestly unevidenced', async () => {
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won on tender TND-1', value: 900_000 });

    const stored = (await store.get(opp.id))!;
    expect(stored.stage).toBe('won');
    expect(stored.awardSource).toBeNull();
    expect(stored.contractedValue).toBeNull();
    expect(stored.awardedAt).toBeNull();
    expect(stored.qualificationAtAward).toBeNull();
    expect(resolveDealOutcome(stored).state).toBe('LEGACY_WON');
    // …and it says so, rather than showing today's mutable figure under a historical label.
    expect(resolveQualificationProvenance({ terminal: true, atAward: stored.qualificationAtAward }).kind).toBe('NOT_CAPTURED');
    expect(await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityQualificationCaptured })).toHaveLength(0);
  });

  it('a tender LOSS never stamps award provenance, even if a caller passes some', async () => {
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'lost', { reason: 'Lost on price', award: provenance() });

    const stored = (await store.get(opp.id))!;
    expect(stored.stage).toBe('lost');
    expect(stored.awardSource).toBeNull();
    expect(stored.contractedValue).toBeNull();
    expect(stored.awardedAt).toBeNull();
    expect(stored.qualificationAtAward).toBeNull();
    expect(resolveDealOutcome(stored).state).toBe('LOST');
  });

  it('a redelivered award does not re-close, re-stamp or re-capture', async () => {
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });
    const after = await store.get(opp.id);

    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance({ contractedValue: 111, awardReference: 'LOA-OTHER' }) });

    const stored = (await store.get(opp.id))!;
    expect(stored.contractedValue).toBe(987_654);   // NOT rewritten by the replay
    expect(stored.qualificationAtAward).toEqual(after!.qualificationAtAward);
    expect(await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityQualificationCaptured })).toHaveLength(1);
  });
});

describe('money surfaces read the tender award through the one definition', () => {
  it('DealFacts reports the award value + the at-award snapshot for a governed tender win', async () => {
    const { store, svc } = build();
    const opp = await seedTenderDeal(store, { value: 1_250_000 });
    await svc.updateQualification(opp.id, { authority: { status: 'CONFIRMED', evidence: 'Signed by the CFO' } }, ACTOR);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', award: provenance() });

    const facts = buildDealFacts({ opportunity: (await store.get(opp.id))!, contracts: [], quotations: [], projects: [], stakeholders: [] });
    expect(facts.outcome.state).toBe('GOVERNED_WON');
    expect(facts.outcome.awardDocumented).toBe(true);
    expect(facts.outcome.awardSource).toBe('tender_award');
    // The customer awarded the tender, so there is no accepted quotation revision to name.
    expect(facts.outcome.awardedQuotationId).toBeNull();
    // The two money facts arrive SEPARATELY and stay different numbers.
    expect(facts.commercial.awardValue).toBe(987_654);
    expect(facts.commercial.headlineValue).toBe(1_250_000);
    expect(facts.qualification.atAward).not.toBeNull();
    expect(facts.qualification.atAward!.confirmed).toBe(1);
    expect(facts.qualification.atAward!.snapshot.awardSource).toBe('tender_award');
  });

  it('an unevidenced tender win reports no award value and no at-award record', async () => {
    const { store, svc } = build();
    const opp = await seedTenderDeal(store);
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won', value: 900_000 });

    const facts = buildDealFacts({ opportunity: (await store.get(opp.id))!, contracts: [], quotations: [], projects: [], stakeholders: [] });
    expect(facts.outcome.state).toBe('LEGACY_WON');
    expect(facts.outcome.awardDocumented).toBe(false);
    // No authoritative figure — and the headline is NOT promoted to stand in for one.
    expect(facts.commercial.awardValue).toBeNull();
    expect(facts.commercial.headlineValue).toBe(1_250_000);
    expect(facts.qualification.atAward).toBeNull();
  });
});
