import { describe, expect, it, beforeEach } from 'vitest';
import { CloseoutService, type CloseoutReadinessGate } from './closeout.service';
import { InMemoryCloseoutStore } from './in-memory-closeout-store';
import { InMemoryEventStore, EventBus, AccessService } from '@aura/core';
import type { CloseoutReadiness, ReadinessCheck } from './domain/closeout-readiness';

/**
 * Enforcement, not display.
 *
 * Readiness rendered on a screen is advice: a caller who posts straight to the endpoint routes
 * around it, and the checklist is still the whole rule. These assert that the WRITE refuses —
 * which is the only place a gate can actually bind.
 */

const check = (over: Partial<ReadinessCheck> = {}): ReadinessCheck => ({
  id: 'quality-ncrs', domain: 'quality', label: 'Non-conformances resolved', state: 'pass', ...over,
});

const gate = (verdict: Partial<CloseoutReadiness>): CloseoutReadinessGate => ({
  assess: async () => ({ ready: false, checks: [], blocked: [], unknown: [], ...verdict } as CloseoutReadiness),
});

const TENANT = 't1';

async function serviceWith(readiness: CloseoutReadinessGate | null) {
  const store = new InMemoryCloseoutStore();
  const svc = new CloseoutService(store, new InMemoryEventStore(new EventBus()), new AccessService(), null, readiness);
  const created = await svc.start({ tenantId: TENANT, projectId: 'p1', projectName: 'P1' });
  // Every manual box ticked — the state that used to be sufficient on its own.
  for (let i = 0; i < created.items.length; i += 1) {
    await svc.setItem(TENANT, created.id, i, true);
  }
  return { svc, id: created.id, store };
}

describe('closeout finalization enforces readiness', () => {
  let events: InMemoryEventStore;
  beforeEach(() => { events = new InMemoryEventStore(new EventBus()); });

  it('refuses a BLOCKED project even with every checklist box ticked', async () => {
    const blocked = check({ state: 'blocked', detail: '2 major non-conformances still open.' });
    const { svc, id } = await serviceWith(gate({ ready: false, checks: [blocked], blocked: [blocked] }));
    await expect(svc.finalize(TENANT, id, '2026-09-30')).rejects.toThrow(/not ready/);
    await expect(svc.finalize(TENANT, id, '2026-09-30')).rejects.toThrow(/2 major non-conformances still open/);
  });

  it('refuses an UNVERIFIED project — an unreadable domain is not a lenient case', async () => {
    const unknown = check({ state: 'unknown', domain: 'commissioning', detail: 'Commissioning could not be read.' });
    const { svc, id } = await serviceWith(gate({ ready: false, checks: [unknown], unknown: [unknown] }));
    await expect(svc.finalize(TENANT, id, '2026-09-30')).rejects.toThrow(/unverified — commissioning/);
  });

  it('names every blocker, so the caller is not told to guess which one', async () => {
    const a = check({ id: 'quality-ncrs', state: 'blocked', detail: '1 non-conformance still open.' });
    const b = check({ id: 'commissioning-punch', domain: 'commissioning', state: 'blocked', detail: '4 punch items open.' });
    const { svc, id } = await serviceWith(gate({ ready: false, checks: [a, b], blocked: [a, b] }));
    const err = await svc.finalize(TENANT, id, '2026-09-30').catch((e: Error) => e.message);
    expect(err).toContain('1 non-conformance still open');
    expect(err).toContain('4 punch items open');
  });

  it('allows the close when every domain passes, and stamps the permitting evidence', async () => {
    const passing = [check({ state: 'pass' }), check({ id: 'commissioning-punch', domain: 'commissioning', state: 'pass' })];
    const store = new InMemoryCloseoutStore();
    const svc = new CloseoutService(store, events, new AccessService(), null, gate({ ready: true, checks: passing }));
    const created = await svc.start({ tenantId: TENANT, projectId: 'p1', projectName: 'P1' });
    for (let i = 0; i < created.items.length; i += 1) await svc.setItem(TENANT, created.id, i, true);

    const done = await svc.finalize(TENANT, created.id, '2026-09-30');
    expect(done.status).toBe('completed');

    // The question this answers is asked in a dispute months later: why was this allowed to close?
    const completed = (await events.list()).find((e) => e.type.endsWith('completed'));
    const payload = completed?.payload as { readiness?: { ready: boolean; checks: Array<{ id: string; state: string }> } };
    expect(payload?.readiness?.ready).toBe(true);
    expect(payload?.readiness?.checks.map((c) => c.id)).toEqual(['quality-ncrs', 'commissioning-punch']);
  });

  it('still refuses an unticked checklist — the domain rule did not move, it gained company', async () => {
    const store = new InMemoryCloseoutStore();
    const svc = new CloseoutService(store, events, new AccessService(), null, gate({ ready: true, checks: [] }));
    const created = await svc.start({ tenantId: TENANT, projectId: 'p1', projectName: 'P1' });
    await expect(svc.finalize(TENANT, created.id, '2026-09-30')).rejects.toThrow(/checklist items are not done/);
  });

  it('records that no gate was configured rather than implying one passed', async () => {
    // A deployment without the ports wired must not leave an event that reads like a clean verdict.
    const store = new InMemoryCloseoutStore();
    const svc = new CloseoutService(store, events, new AccessService(), null, null);
    const created = await svc.start({ tenantId: TENANT, projectId: 'p1', projectName: 'P1' });
    for (let i = 0; i < created.items.length; i += 1) await svc.setItem(TENANT, created.id, i, true);
    await svc.finalize(TENANT, created.id, '2026-09-30');

    const completed = (await events.list()).find((e) => e.type.endsWith('completed'));
    const payload = completed?.payload as { readiness?: { ready: boolean | null; note?: string } };
    expect(payload?.readiness?.ready).toBeNull();
    expect(payload?.readiness?.note).toMatch(/no readiness gate/);
  });
});
