import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService } from '@aura/core';
import { CRM_EVENT, makeOpportunity, type Opportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

// Slice 9 governance fix — the award conflict must be SYMMETRIC and REPLAY-SAFE:
//   1. an authoritative award already won it, then a manual override is attempted → reject AND record
//      a durable conflict (the reverse of "override first, then a quotation award");
//   2. the SAME conflicting award identity produces ONE conflict record, even on repeated delivery.

const aiStub = { complete: async () => ({ text: '' }) } as never;

function build(classification: 'direct_legacy' | 'direct_governed' = 'direct_governed') {
  const store = new InMemoryOpportunityStore();
  const events = new InMemoryEventStore(new EventBus());
  const svc = new OpportunityService(store, events, new NullTxRunner(), new AccessService(), aiStub, { classify: async () => classification });
  return { store, events, svc };
}
async function seedDirect(store: InMemoryOpportunityStore): Promise<Opportunity> {
  const opp = makeOpportunity({ tenantId: 't1', title: 'Deal', value: 999, executionType: 'direct_sale' });
  await store.create(opp);
  return opp;
}
const conflicts = (events: InMemoryEventStore, id: string) =>
  events.list({ tenantId: 't1', type: CRM_EVENT.opportunityAwardConflict, aggregateId: id });
const acceptedAward = (over = {}) => ({
  awardedQuotationId: 'Q-002', contractedValue: 85767, valueSource: 'commercial_baseline' as const,
  reason: 'Customer accepted Q-002', source: 'quotation_accepted' as const, ...over,
});

describe('award conflict — direction 1: quotation award first, then manual override', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  it('rejects the override, does NOT overwrite the award, and records a durable conflict', async () => {
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, acceptedAward()); // Won from Q-002

    await expect(
      svc.overrideAwardOutcome(opp.id, { reason: 'boss said so', actorId: 'u-mgr' }),
    ).rejects.toThrow(/already won from an authoritative award/i);

    // Award untouched — the quotation award stands.
    const stored = await store.get(opp.id);
    expect(stored!.awardSource).toBe('quotation_accepted');
    expect(stored!.awardedQuotationId).toBe('Q-002');

    // A durable conflict was recorded, tagged as a manual-override attempt.
    const c = await conflicts(events, opp.id);
    expect(c).toHaveLength(1);
    expect(c[0].payload).toMatchObject({ attemptedSource: 'manual_override', existingAwardSource: 'quotation_accepted', existingAwardedQuotationId: 'Q-002' });
  });

  it('is idempotent: the same actor retrying the override records only ONE conflict', async () => {
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, acceptedAward());
    for (let i = 0; i < 3; i++) {
      await expect(svc.overrideAwardOutcome(opp.id, { reason: 'again', actorId: 'u-mgr' })).rejects.toThrow();
    }
    expect(await conflicts(events, opp.id)).toHaveLength(1); // deduped by actor
  });
});

describe('award conflict — direction 2: manual override first, then a quotation award', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  it('records a durable conflict on the incoming award and does NOT overwrite the override', async () => {
    const opp = await seedDirect(store);
    await svc.overrideAwardOutcome(opp.id, { reason: 'awarded offline', contractedValue: 50000, actorId: 'u-mgr' });

    const r = await svc.applyAwardOutcome(opp.id, acceptedAward()); // conflicting quotation award arrives
    expect(r.outcome).toBe('award_conflict');

    const stored = await store.get(opp.id);
    expect(stored!.awardSource).toBe('manual_override'); // override stands, not overwritten
    expect(stored!.contractedValue).toBe(50000);

    const c = await conflicts(events, opp.id);
    expect(c).toHaveLength(1);
    expect(c[0].payload).toMatchObject({ attemptedSource: 'quotation_accepted', incomingQuotationId: 'Q-002', existingAwardSource: 'manual_override' });
  });

  it('is idempotent: redelivering the SAME conflicting award records only ONE conflict', async () => {
    const opp = await seedDirect(store);
    await svc.overrideAwardOutcome(opp.id, { reason: 'offline', actorId: 'u-mgr' });
    for (let i = 0; i < 3; i++) {
      expect((await svc.applyAwardOutcome(opp.id, acceptedAward())).outcome).toBe('award_conflict');
    }
    expect(await conflicts(events, opp.id)).toHaveLength(1); // deduped by incoming quotation identity
  });
});

describe('award conflict — two different quotations, replay-safe', () => {
  it('one conflict per DISTINCT incoming quotation; replays add nothing', async () => {
    const { store, events, svc } = build();
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-002' })); // Won from Q-002

    await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-003' })); // conflict #1
    await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-003' })); // replay → no new
    await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-004' })); // conflict #2

    const c = await conflicts(events, opp.id);
    expect(c).toHaveLength(2);
    expect(c.map((e) => (e.payload as { incomingQuotationId: string }).incomingQuotationId).sort()).toEqual(['Q-003', 'Q-004']);
    // the original award is still Q-002, untouched
    expect((await store.get(opp.id))!.awardedQuotationId).toBe('Q-002');
  });
});
