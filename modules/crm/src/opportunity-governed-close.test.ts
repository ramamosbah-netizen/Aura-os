import { describe, it, expect } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService } from '@aura/core';
import { CRM_EVENT, makeOpportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';
import type { OpportunityGovernance, OpportunityGovernanceResolver } from './opportunity-governance';

// Slice 9 PR-2 — the governed-Won bypass block lives in the SERVICE. A governed direct deal cannot be
// Won through the generic update() path by ANY caller (controller, direct API, internal). Enforcement
// is via a MANDATORY, fail-closed classifier — never a caller-passed flag.

const aiStub = { complete: async () => ({ text: '' }) } as never;

function build(resolver: OpportunityGovernanceResolver) {
  const store = new InMemoryOpportunityStore();
  const events = new InMemoryEventStore(new EventBus());
  const svc = new OpportunityService(store, events, new NullTxRunner(), new AccessService(), aiStub, resolver);
  return { store, events, svc };
}
const fixed = (c: OpportunityGovernance): OpportunityGovernanceResolver => ({ classify: async () => c });
async function seed(store: InMemoryOpportunityStore, over = {}) {
  const opp = { ...makeOpportunity({ tenantId: 't1', title: 'Deal', value: 1000, executionType: 'direct_sale' }), ...over };
  await store.create(opp);
  return opp;
}

describe('Slice 9 PR-2 — governed deal cannot be Won from the generic update()', () => {
  it('direct_governed + generic Won → REJECTED (acceptance or explicit override required)', async () => {
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store);
    await expect(svc.update(opp.id, { stage: 'won', winReason: 'we won' }, null)).rejects.toThrow(/governed manual override|accepting its quotation/i);
    expect((await store.get(opp.id))!.stage).not.toBe('won'); // unchanged
  });

  it('the block is UNCONDITIONAL — even an actor with authority cannot generic-Won a governed deal', async () => {
    // The block is upstream of any permission; the generic PATCH is never an override. (Permission is
    // proven separately to gate the EXPLICIT override command, not this path.)
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store);
    await expect(svc.update(opp.id, { stage: 'won', winReason: 'manager says so' }, null)).rejects.toThrow(/governed/i);
  });

  it('direct_legacy + Won → allowed (no Pre-Award chain to protect)', async () => {
    const { store, svc } = build(fixed('direct_legacy'));
    const opp = await seed(store);
    const r = await svc.update(opp.id, { stage: 'won', winReason: 'legacy win', value: 1000 }, null);
    expect(r.stage).toBe('won');
  });

  it('tender_owned + Won → rejected (the tender owns the outcome)', async () => {
    const { store, svc } = build(fixed('tender_owned'));
    const opp = await seed(store, { tenderId: 'tender-1', executionType: 'tender', requiresTender: true });
    await expect(svc.update(opp.id, { stage: 'won', winReason: 'x' }, null)).rejects.toThrow(/tender/i);
  });

  it('FAIL-CLOSED — if governance cannot be classified, the manual Won fails (never assumed legacy)', async () => {
    const failing: OpportunityGovernanceResolver = { classify: async () => { throw new Error('package store unreachable'); } };
    const { store, svc } = build(failing);
    const opp = await seed(store);
    await expect(svc.update(opp.id, { stage: 'won', winReason: 'x' }, null)).rejects.toThrow(/unreachable/);
    expect((await store.get(opp.id))!.stage).not.toBe('won');
  });

  it('a non-Won stage change on a governed deal is NOT blocked', async () => {
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store, { stage: 'qualification', needConfirmed: true });
    const r = await svc.update(opp.id, { stage: 'proposal' }, null, { hasStakeholder: true });
    expect(r.stage).toBe('proposal');
  });

  // #1 — having the override permission must NOT make the generic PATCH Won legal.
  it('an override-permissioned Sales Manager still cannot generic-Won a governed deal via update()', async () => {
    const access = new AccessService();
    access.registerRole({ id: 'salesManager', name: 'SM', permissions: ['crm.*.create', 'crm.*.update', 'crm.opportunity.override'] });
    access.grant({ userId: 'u-mgr', roleId: 'salesManager', scope: { kind: 'org', level: 'tenant', id: 't1' } });
    const store = new InMemoryOpportunityStore();
    const svc = new OpportunityService(store, new InMemoryEventStore(new EventBus()), new NullTxRunner(), access, aiStub, fixed('direct_governed'));
    const opp = await seed(store);
    // the generic update-permission check passes for the SM, but the governed-Won block still fires
    await expect(svc.update(opp.id, { stage: 'won', winReason: 'manager attempt' }, 'u-mgr')).rejects.toThrow(/governed/i);
    expect((await store.get(opp.id))!.stage).not.toBe('won');
  });
});

describe('Slice 9 PR-2 — overrideAwardOutcome (the explicit, audited manual override)', () => {
  it('closes Won with manual_override provenance + an audit event carrying the warning', async () => {
    const { store, events, svc } = build(fixed('direct_governed'));
    const opp = await seed(store, { value: 999999 });
    const r = await svc.overrideAwardOutcome(opp.id, { reason: 'PO received by email', contractedValue: 50000, evidenceReference: 'PO-4471', actorId: 'u-mgr' });
    expect(r.stage).toBe('won');
    expect(r.awardSource).toBe('manual_override');
    expect(r.contractedValue).toBe(50000);      // exactly what the user entered
    expect(r.value).toBe(999999);               // forecast value untouched, and NOT promoted
    const audit = await events.list({ tenantId: 't1', type: CRM_EVENT.opportunityAwardOverride });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ reason: 'PO received by email', evidenceReference: 'PO-4471', contractedValue: 50000, warning: 'No authoritative accepted quotation' });
  });

  it('never promotes opportunity.value into contractedValue — omitted value ⇒ null', async () => {
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store, { value: 999999 });
    const r = await svc.overrideAwardOutcome(opp.id, { reason: 'awarded verbally', actorId: 'u-mgr' });
    expect(r.contractedValue).toBeNull();       // NOT 999999
  });

  it('is idempotent — replaying the same override is a no-op', async () => {
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store);
    await svc.overrideAwardOutcome(opp.id, { reason: 'x', contractedValue: 100, actorId: 'u-mgr' });
    const before = await store.get(opp.id);
    const again = await svc.overrideAwardOutcome(opp.id, { reason: 'x', contractedValue: 100, actorId: 'u-mgr' });
    expect(again).toEqual(before);
  });

  it('refuses to override a tender-owned deal (its tender owns the outcome)', async () => {
    const { store, svc } = build(fixed('tender_owned'));
    const opp = await seed(store, { tenderId: 'tender-1' });
    await expect(svc.overrideAwardOutcome(opp.id, { reason: 'x', actorId: 'u-mgr' })).rejects.toThrow(/tender/i);
  });

  it('requires a reason', async () => {
    const { store, svc } = build(fixed('direct_governed'));
    const opp = await seed(store);
    await expect(svc.overrideAwardOutcome(opp.id, { reason: '  ', actorId: 'u-mgr' })).rejects.toThrow(/reason/i);
  });
});
