import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type AiService, type EventStore } from '@aura/core';
import { makeOpportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

/** S6 — Pursue/No-Pursue decision + customer buying stage on the Opportunity. */
function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const ai = {} as unknown as AiService;
  const store = new InMemoryOpportunityStore();
  const svc = new OpportunityService(store, events, new NullTxRunner(), access, ai);
  return { svc, store };
}

describe('OpportunityService — pursuit + buying journey', () => {
  it('records a PURSUE decision, scoring it from the assessment dimensions', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV upgrade' });
    await store.create(opp);

    const res = await svc.recordPursuit(opp.id, {
      decision: 'PURSUE',
      dimensions: { strategicFit: 80, winability: 70, expectedMargin: 60 },
      rationale: 'strong incumbent position',
      actorId: 'u1',
    });

    expect(res.pursuitDecision).toBe('PURSUE');
    expect(res.pursuitScore).toBe(70); // (80+70+60)/3
    expect(res.pursuitDecidedBy).toBe('u1');
    expect(res.pursuitDecidedAt).toBeTruthy();
    expect(res.pursuitDimensions).toMatchObject({ strategicFit: 80 });
    // persisted
    expect((await store.get(opp.id))?.pursuitDecision).toBe('PURSUE');
  });

  it('keeps a NO_PURSUE decision (rejected pursuit is history, not a delete)', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'Low-margin tender' });
    await store.create(opp);

    await svc.recordPursuit(opp.id, { decision: 'NO_PURSUE', dimensions: { winability: 20, expectedMargin: 15 }, rationale: 'no access, thin margin', actorId: 'u1' });

    const stored = await store.get(opp.id);
    expect(stored?.pursuitDecision).toBe('NO_PURSUE');
    expect(stored?.pursuitScore).toBeLessThan(40);
    expect(stored).not.toBeNull(); // opportunity is retained
  });

  it('sets the customer buying stage via update', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'Deal', stage: 'proposal' });
    await store.create(opp);

    const updated = await svc.update(opp.id, { buyingStage: 'PROBLEM_RECOGNIZED' }, 'u1');
    expect(updated.buyingStage).toBe('PROBLEM_RECOGNIZED');
    expect((await store.get(opp.id))?.buyingStage).toBe('PROBLEM_RECOGNIZED');
  });
});
