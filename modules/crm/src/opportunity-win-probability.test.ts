import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type AiService, type EventStore } from '@aura/core';
import { makeOpportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';

/**
 * Win-probability range integrity on the UPDATE path.
 *
 * `create` inherits the rule through makeOpportunity, but an update never touches the factory — so
 * without a guard in the service, PATCH was the one write path with no range rule at all. This
 * matters beyond HTTP: the DTO decorators only run for a request, while tests, jobs, reactors and
 * any internal caller reach this service directly.
 *
 * Rejects, never clamps: a refused update must leave the STORED value untouched.
 */
function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const access = { assert: vi.fn(), can: () => ({ allowed: true, reason: 'ok' }) } as unknown as AccessService;
  const ai = {} as unknown as AiService;
  const store = new InMemoryOpportunityStore();
  const svc = new OpportunityService(store, events, new NullTxRunner(), access, ai, { classify: async () => 'direct_legacy' as const });
  return { svc, store, events };
}

async function seed(store: InMemoryOpportunityStore, winProbability = 40) {
  const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV upgrade', winProbability });
  await store.create(opp);
  return opp;
}

describe('OpportunityService.update — win probability range', () => {
  it.each([0, 100, 20.5, 65])('accepts a valid %p', async (v) => {
    const { svc, store } = harness();
    const opp = await seed(store);
    const updated = await svc.update(opp.id, { winProbability: v });
    expect(updated.winProbability).toBe(v);
    expect((await store.get(opp.id))?.winProbability).toBe(v);
  });

  it.each([-0.01, 100.01, 150, -10, NaN, Infinity, -Infinity])('rejects %p', async (v) => {
    const { svc, store } = harness();
    const opp = await seed(store, 40);
    await expect(svc.update(opp.id, { winProbability: v })).rejects.toThrow(/win probability must be a finite number between 0 and 100/i);
  });

  it('leaves the stored value untouched when it refuses — no clamp, no partial write', async () => {
    const { svc, store, events } = harness();
    const opp = await seed(store, 40);
    await expect(svc.update(opp.id, { title: 'Renamed', winProbability: 150 })).rejects.toThrow();
    const after = await store.get(opp.id);
    expect(after?.winProbability).toBe(40);
    // The whole update is refused, so the unrelated field in the same patch does not land either.
    expect(after?.title).toBe('CCTV upgrade');
    expect(events.appendWithClient).not.toHaveBeenCalled();
  });

  it('leaves win probability alone on a sparse patch that omits it', async () => {
    const { svc, store } = harness();
    const opp = await seed(store, 40);
    const updated = await svc.update(opp.id, { title: 'Renamed' });
    expect(updated.winProbability).toBe(40);
    expect(updated.title).toBe('Renamed');
  });

  it('refuses BEFORE the stage gate, so a bad number cannot ride in on a valid stage change', async () => {
    const { svc, store } = harness();
    const opp = await seed(store, 40);
    await expect(svc.update(opp.id, { stage: 'proposal', winProbability: 150 })).rejects.toThrow(/win probability must be/i);
  });
});
