import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService } from '@aura/core';
import { CRM_EVENT, makeOpportunity, type Opportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

// Slice 9 PR-1 — the sanctioned award command. Proves identity-based idempotency (not merely
// state-based), authoritative value + provenance, and the conflict guard that stops a later award
// silently rewriting an earlier one.

const aiStub = { complete: async () => ({ text: '' }) } as never;

function build() {
  const store = new InMemoryOpportunityStore();
  const events = new InMemoryEventStore(new EventBus());
  const svc = new OpportunityService(store, events, new NullTxRunner(), new AccessService(), aiStub);
  return { store, events, svc };
}

async function seedDirect(store: InMemoryOpportunityStore, over: Partial<Opportunity> = {}): Promise<Opportunity> {
  const opp: Opportunity = { ...makeOpportunity({ tenantId: 't1', title: 'Deal', value: 999, executionType: 'direct_sale' }), ...over };
  await store.create(opp);
  return opp;
}

const award = (over = {}) => ({
  awardedQuotationId: 'Q-002', contractedValue: 85767, valueSource: 'commercial_baseline' as const,
  reason: 'Customer accepted Q-002', source: 'quotation_accepted' as const, ...over,
});

describe('applyAwardOutcome', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  it('closes an open direct deal Won with authoritative value + provenance (never opportunity.value)', async () => {
    const opp = await seedDirect(store);
    const r = await svc.applyAwardOutcome(opp.id, award());
    expect(r.outcome).toBe('won');
    const stored = await store.get(opp.id);
    expect(stored!.stage).toBe('won');
    expect(stored!.contractedValue).toBe(85767);       // from the baseline, not value (999)
    expect(stored!.value).toBe(999);                    // headline untouched
    expect(stored!.awardedQuotationId).toBe('Q-002');
    expect(stored!.awardSource).toBe('quotation_accepted');
    expect(stored!.awardedAt).toBeTruthy();
    // the stage_changed event carries the provenance incl. valueSource
    const ev = (await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityStageChanged })).at(-1);
    expect(ev!.payload).toMatchObject({ awardedQuotationId: 'Q-002', contractedValue: 85767, valueSource: 'commercial_baseline' });
  });

  it('is idempotent by IDENTITY: replaying the SAME award is a no-op', async () => {
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, award());
    const before = await store.get(opp.id);
    const r = await svc.applyAwardOutcome(opp.id, award());
    expect(r.outcome).toBe('noop_same_award');
    expect(await store.get(opp.id)).toEqual(before); // nothing changed
  });

  it('a DIFFERENT quotation award on an already-won deal is a CONFLICT, never an overwrite', async () => {
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, award({ awardedQuotationId: 'Q-002', contractedValue: 85767 }));
    const r = await svc.applyAwardOutcome(opp.id, award({ awardedQuotationId: 'Q-003', contractedValue: 91500 }));
    expect(r.outcome).toBe('award_conflict');
    const stored = await store.get(opp.id);
    expect(stored!.awardedQuotationId).toBe('Q-002');   // NOT overwritten
    expect(stored!.contractedValue).toBe(85767);        // NOT overwritten
    // the anomaly is recorded, not silent
    const conflict = await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityAwardConflict });
    expect(conflict).toHaveLength(1);
    expect(conflict[0].payload).toMatchObject({ existingAwardedQuotationId: 'Q-002', incomingQuotationId: 'Q-003' });
  });

  it('never closes a tender-owned deal (the tender path owns that outcome)', async () => {
    const opp = await seedDirect(store, { tenderId: 'tender-1' });
    const r = await svc.applyAwardOutcome(opp.id, award());
    expect(r.outcome).toBe('skipped_tender');
    expect((await store.get(opp.id))!.stage).not.toBe('won');
  });

  it('leaves an already-lost deal untouched', async () => {
    const opp = await seedDirect(store, { stage: 'lost', lossReason: 'price' });
    const r = await svc.applyAwardOutcome(opp.id, award());
    expect(r.outcome).toBe('skipped_closed');
    expect((await store.get(opp.id))!.stage).toBe('lost');
  });

  it('records the legacy value source when there is no baseline', async () => {
    const opp = await seedDirect(store);
    await svc.applyAwardOutcome(opp.id, award({ valueSource: 'legacy_quotation_total' }));
    const ev = (await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityStageChanged })).at(-1);
    expect(ev!.payload).toMatchObject({ valueSource: 'legacy_quotation_total' });
  });
});
