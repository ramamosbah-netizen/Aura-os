import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService } from '@aura/core';
import { CRM_EVENT, makeOpportunity, qualificationView, type Opportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

/**
 * ADR-0020 — the immutable qualification-at-award snapshot.
 *
 * THE INCIDENT these tests exist for: opportunity 41aee1b0 was awarded at 17:07 on 2026-08-26
 * (`awardSource = quotation_accepted`) and had `needConfirmed` un-ticked at 18:39, moving a CLOSED
 * deal's qualification from 1/4 to 0/4. Nothing was corrupted — AURA had no notion of "what was true
 * at award", so every figure it could show for a closed deal was the current one.
 *
 * The invariant under test: capture happens exactly once, atomically with a REAL award, from the
 * record as it stood, and can never afterwards be changed by anything.
 */

const aiStub = { complete: async () => ({ text: '' }) } as never;

function build(classification: 'direct_legacy' | 'direct_governed' = 'direct_governed') {
  const store = new InMemoryOpportunityStore();
  const events = new InMemoryEventStore(new EventBus());
  const svc = new OpportunityService(store, events, new NullTxRunner(), new AccessService(), aiStub, { classify: async () => classification });
  return { store, events, svc };
}

async function seedDirect(store: InMemoryOpportunityStore, over: Partial<Opportunity> = {}): Promise<Opportunity> {
  const opp = { ...makeOpportunity({ tenantId: 't1', title: 'Deal', value: 999, executionType: 'direct_sale' }), ...over };
  await store.create(opp);
  return opp;
}

const acceptedAward = (over = {}) => ({
  awardedQuotationId: 'Q-002', contractedValue: 85767, valueSource: 'commercial_baseline' as const,
  reason: 'Customer accepted Q-002', source: 'quotation_accepted' as const, ...over,
});

const snapshotOf = async (store: InMemoryOpportunityStore, id: string) => (await store.get(id))!.qualificationAtAward;
const confirmedAtAward = async (store: InMemoryOpportunityStore, id: string) => {
  const s = await snapshotOf(store, id);
  return s ? qualificationView(s.dimensions).confirmed : null;
};
const captures = (events: InMemoryEventStore, id: string) =>
  events.list({ tenantId: 't1', type: CRM_EVENT.opportunityQualificationCaptured, aggregateId: id });

describe('1 · an award captures the qualification snapshot', () => {
  let store: InMemoryOpportunityStore, events: InMemoryEventStore, svc: OpportunityService;
  beforeEach(() => { ({ store, events, svc } = build()); });

  it('freezes the record, its provenance, and the award timestamp', async () => {
    const opp = await seedDirect(store, { budgetConfirmed: true, needConfirmed: true, timelineConfirmed: true });
    const { opportunity: won } = await svc.applyAwardOutcome(opp.id, acceptedAward());

    const snap = await snapshotOf(store, opp.id);
    expect(snap).not.toBeNull();
    expect(snap!.version).toBe(1);
    expect(snap!.awardSource).toBe('quotation_accepted');
    expect(snap!.awardedQuotationId).toBe('Q-002');
    // Stamped with the award's OWN timestamp — a second now() could drift from `awardedAt`.
    expect(snap!.capturedAt).toBe(won.awardedAt);
    expect(await confirmedAtAward(store, opp.id)).toBe(3);
    expect(snap!.dimensions.authority.status).toBe('UNKNOWN');
  });

  it('the returned opportunity carries the snapshot, so the caller need not re-read', async () => {
    const opp = await seedDirect(store, { needConfirmed: true });
    const { opportunity } = await svc.applyAwardOutcome(opp.id, acceptedAward());
    expect(opportunity.qualificationAtAward?.awardSource).toBe('quotation_accepted');
  });

  it('emits a durable audit copy carrying the WHOLE snapshot, not just a count', async () => {
    const opp = await seedDirect(store, { budgetConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    const [e] = await captures(events, opp.id);
    expect(e).toBeDefined();
    const payload = e.payload as { confirmed: number; snapshot: { dimensions: Record<string, { status: string }> } };
    expect(payload.confirmed).toBe(1);
    expect(payload.snapshot.dimensions.budget.status).toBe('CONFIRMED');
  });
});

describe('2 · changing qualification AFTER the award never touches the snapshot', () => {
  let store: InMemoryOpportunityStore, svc: OpportunityService;
  beforeEach(() => { ({ store, svc } = build()); });

  it('THE INCIDENT, replayed: un-ticking after the close moves the record, not history', async () => {
    const opp = await seedDirect(store, { needConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());
    expect(await confirmedAtAward(store, opp.id)).toBe(1);

    // 18:39 — the same edit that caused this work, through the same checkbox path.
    await svc.update(opp.id, { needConfirmed: false });

    const after = (await store.get(opp.id))!;
    expect(after.needConfirmed).toBe(false);                       // the record moved…
    expect(qualificationView(after.qualification!).confirmed).toBe(0);
    expect(await confirmedAtAward(store, opp.id)).toBe(1);          // …and history did not
    expect(after.qualificationAtAward!.dimensions.need.status).toBe('CONFIRMED');
  });

  it('the evidence-bearing writer cannot reach it either', async () => {
    const opp = await seedDirect(store, { budgetConfirmed: true, authorityConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    await svc.updateQualification(opp.id, { budget: { status: 'BLOCKER', evidence: 'funding pulled' }, authority: { status: 'UNKNOWN' } }, 'u-admin');

    const after = (await store.get(opp.id))!;
    expect(qualificationView(after.qualification!).confirmed).toBe(0);
    expect(await confirmedAtAward(store, opp.id)).toBe(2);
  });

  it('a post-close edit is allowed and AUDITED — it is legitimate, and it is why history is kept', async () => {
    const { store: s2, events: e2, svc: v2 } = build();
    const opp = await seedDirect(s2, { needConfirmed: true });
    await v2.applyAwardOutcome(opp.id, acceptedAward());
    await v2.updateQualification(opp.id, { need: { status: 'UNKNOWN' } }, 'u-admin');

    const [changed] = await e2.list({ tenantId: 't1', type: CRM_EVENT.opportunityQualificationChanged, aggregateId: opp.id });
    const payload = changed.payload as { before: Record<string, string>; after: Record<string, string>; afterClose: boolean };
    expect(payload.before.need).toBe('CONFIRMED');
    expect(payload.after.need).toBe('UNKNOWN');
    expect(payload.afterClose).toBe(true);
    expect(changed.actorId).toBe('u-admin');
  });
});

describe('3 · a replayed award does not re-capture', () => {
  it('the same accepted quotation redelivered is a no-op — one snapshot, one capture event', async () => {
    const { store, events, svc } = build();
    const opp = await seedDirect(store, { needConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    // Something changes the record between deliveries; the reactor is at-least-once.
    await svc.update(opp.id, { needConfirmed: false, budgetConfirmed: true });
    const r = await svc.applyAwardOutcome(opp.id, acceptedAward());

    expect(r.outcome).toBe('noop_same_award');
    expect(await confirmedAtAward(store, opp.id)).toBe(1);
    expect((await snapshotOf(store, opp.id))!.dimensions.need.status).toBe('CONFIRMED');
    expect((await captures(events, opp.id)).length).toBe(1);
  });
});

describe('4 · a competing award conflict never rewrites the snapshot', () => {
  it('a DIFFERENT quotation arrives for an already-won deal — history stands', async () => {
    const { store, events, svc } = build();
    const opp = await seedDirect(store, { needConfirmed: true, timelineConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-002' }));

    await svc.update(opp.id, { needConfirmed: false, timelineConfirmed: false });
    const r = await svc.applyAwardOutcome(opp.id, acceptedAward({ awardedQuotationId: 'Q-003' }));

    expect(r.outcome).toBe('award_conflict');
    expect(await confirmedAtAward(store, opp.id)).toBe(2);
    expect((await snapshotOf(store, opp.id))!.awardedQuotationId).toBe('Q-002');
    expect((await captures(events, opp.id)).length).toBe(1);
  });

  it('a refused manual override leaves the authoritative snapshot untouched', async () => {
    const { store, svc } = build();
    const opp = await seedDirect(store, { budgetConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    await expect(svc.overrideAwardOutcome(opp.id, { reason: 'boss said so', actorId: 'u-mgr' })).rejects.toThrow(/already won from an authoritative award/i);

    expect((await snapshotOf(store, opp.id))!.awardSource).toBe('quotation_accepted');
    expect(await confirmedAtAward(store, opp.id)).toBe(1);
  });
});

describe('5 · a manual override captures exactly once', () => {
  it('an authorized override IS provenance, so it snapshots', async () => {
    const { store, svc } = build();
    const opp = await seedDirect(store, { budgetConfirmed: true, authorityConfirmed: true });
    const won = await svc.overrideAwardOutcome(opp.id, { reason: 'PO received by email', contractedValue: 50000, actorId: 'u-mgr' });

    const snap = await snapshotOf(store, opp.id);
    expect(snap!.awardSource).toBe('manual_override');
    expect(snap!.awardedQuotationId).toBeNull(); // there is no accepted quotation to point at
    expect(snap!.capturedAt).toBe(won.awardedAt);
    expect(await confirmedAtAward(store, opp.id)).toBe(2);
  });

  it('replaying the override does not re-capture', async () => {
    const { store, events, svc } = build();
    const opp = await seedDirect(store, { budgetConfirmed: true });
    await svc.overrideAwardOutcome(opp.id, { reason: 'PO received', actorId: 'u-mgr' });
    await svc.update(opp.id, { budgetConfirmed: false });
    await svc.overrideAwardOutcome(opp.id, { reason: 'PO received', actorId: 'u-mgr' }); // idempotent replay

    expect(await confirmedAtAward(store, opp.id)).toBe(1);
    expect((await captures(events, opp.id)).length).toBe(1);
  });
});

describe('6 · the capture is INSIDE the award transaction', () => {
  it('the snapshot write joins the transaction handle the award write got', async () => {
    // The structural property that makes rollback possible, provable without a database: the stamp
    // must receive the SAME transaction handle the award write got. A capture issued outside
    // `tx.run` would run on another connection and survive a rolled-back award — leaving a snapshot
    // claiming an award that never happened. Real rollback is proven in the .pg-int suite.
    const HANDLE = { sentinel: 'tx' } as never;
    const store = new InMemoryOpportunityStore();
    const events = new InMemoryEventStore(new EventBus());
    const seen: Array<{ call: string; handle: unknown }> = [];
    const spyStore = {
      ...store,
      get: store.get.bind(store),
      create: store.create.bind(store),
      list: store.list.bind(store),
      listPaged: store.listPaged.bind(store),
      update: store.update.bind(store),
      updateWithClient: async (tx: unknown, o: Opportunity) => { seen.push({ call: 'update', handle: tx }); return store.updateWithClient(tx as never, o); },
      stampQualificationAtAward: async (tx: unknown, id: string, snap: never) => { seen.push({ call: 'stamp', handle: tx }); return store.stampQualificationAtAward(tx as never, id, snap); },
    } as unknown as InMemoryOpportunityStore;
    const recordingTx = { run: <T>(fn: (tx: never) => Promise<T>) => fn(HANDLE) };
    const svc = new OpportunityService(spyStore, events, recordingTx as never, new AccessService(), aiStub, { classify: async () => 'direct_governed' });

    const opp = await seedDirect(store, { needConfirmed: true });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    expect(seen.map((c) => c.call)).toEqual(['update', 'stamp']);
    expect(seen.every((c) => c.handle === HANDLE)).toBe(true);
  });

  it('a failure inside the award tx surfaces, and never leaves a snapshot without an award', async () => {
    const store = new InMemoryOpportunityStore();
    const events = new InMemoryEventStore(new EventBus());
    const faulty = {
      ...events,
      list: events.list.bind(events),
      append: events.append.bind(events),
      appendWithClient: async () => { throw new Error('boom-award-event'); },
    } as unknown as InMemoryEventStore;
    const svc = new OpportunityService(store, faulty, new NullTxRunner(), new AccessService(), aiStub, { classify: async () => 'direct_governed' });

    const opp = await seedDirect(store, { needConfirmed: true });
    await expect(svc.applyAwardOutcome(opp.id, acceptedAward())).rejects.toThrow(/boom-award-event/);

    const after = (await store.get(opp.id))!;
    expect(after.qualificationAtAward === null || after.awardSource !== null).toBe(true);
  });
});

describe('7 · no provenance ⇒ no snapshot (stage = "won" is NOT the trigger)', () => {
  it('a LEGACY manual close captures nothing', async () => {
    const { store, events, svc } = build('direct_legacy');
    const opp = await seedDirect(store, { stage: 'negotiation', budgetConfirmed: true, authorityConfirmed: true, needConfirmed: true, timelineConfirmed: true });

    await svc.update(opp.id, { stage: 'won', winReason: 'verbal go-ahead' });

    const after = (await store.get(opp.id))!;
    expect(after.stage).toBe('won');
    expect(after.awardSource).toBeNull();      // the legacy path stamps no provenance…
    expect(after.qualificationAtAward).toBeNull(); // …so there is no history to claim
    expect((await captures(events, opp.id)).length).toBe(0);
  });

  it('a tender close with NO provenance captures nothing', async () => {
    // `applyTenderOutcome` accepts award provenance as an explicit argument; supplied, it stamps
    // `tender_award` and captures through the same helper as the quotation path (proven in
    // opportunity-award-tender.test.ts). OMITTED — the legacy tender close — it stamps nothing, so
    // there is no history to claim. That is this test: the gate is provenance, never the route and
    // never `stage = 'won'`.
    const { store, svc } = build();
    const opp = await seedDirect(store, { tenderId: 'tender-1', needConfirmed: true });
    await svc.applyTenderOutcome(opp.id, 'won', { reason: 'tender awarded' });

    const after = (await store.get(opp.id))!;
    expect(after.stage).toBe('won');
    expect(after.awardSource).toBeNull();
    expect(after.qualificationAtAward).toBeNull();
  });

  it('a LOST deal captures nothing — a loss is not an award', async () => {
    const { store, svc } = build('direct_legacy');
    const opp = await seedDirect(store, { stage: 'negotiation', needConfirmed: true });
    await svc.update(opp.id, { stage: 'lost', lossReason: 'price' });
    expect((await store.get(opp.id))!.qualificationAtAward).toBeNull();
  });
});

describe('8 · the record and the snapshot stay separately readable', () => {
  it('a deal that never used the rich model still snapshots what the booleans said', async () => {
    const { store, svc } = build();
    // qualification === null: a pre-Phase-2 deal. The snapshot records the STATUS honestly and
    // records NO provenance for it, rather than inventing a source and a date.
    const opp = await seedDirect(store, { budgetConfirmed: true, qualification: null });
    await svc.applyAwardOutcome(opp.id, acceptedAward());

    const snap = await snapshotOf(store, opp.id);
    expect(snap!.dimensions.budget).toEqual({ status: 'CONFIRMED', evidence: null, source: null, confirmedBy: null, confirmedAt: null });
  });

  it('the compatibility booleans keep tracking the canonical record', async () => {
    const { store, svc } = build();
    const opp = await seedDirect(store);
    await svc.updateQualification(opp.id, { budget: { status: 'CONFIRMED', evidence: 'signed budget', source: 'document' }, authority: { status: 'BLOCKER' } }, 'u-rep');

    const after = (await store.get(opp.id))!;
    expect(after.budgetConfirmed).toBe(true);
    expect(after.authorityConfirmed).toBe(false); // a BLOCKER is not a confirmation
    expect(after.qualification!.budget.confirmedBy).toBe('u-rep');
  });
});
