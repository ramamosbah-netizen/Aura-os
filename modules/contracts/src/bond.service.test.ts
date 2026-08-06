import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { BondService } from './bond.service';
import { InMemoryBondStore } from './in-memory-bond-store';

// A bond's status changes are commercial facts — an expired performance bond as much as a called
// one. `act` used to emit nothing at all for `expire`, so the register moved with no trail behind it.

function harness() {
  const store = new InMemoryBondStore();
  const append = vi.fn().mockResolvedValue(undefined);
  const events = { append } as unknown as EventStore;
  const svc = new BondService(store, events);
  const emitted = () => append.mock.calls.flatMap((c) => (c[0] as Array<{ type: string }>).map((e) => e.type));
  const seed = () =>
    svc.create({ tenantId: 't1', contractId: 'c1', kind: 'performance', reference: 'PB-1', amount: 100_000, expiryDate: '2026-01-10' });
  return { svc, emitted, seed };
}

describe('BondService', () => {
  it('emits contracts.bond.expired when a bond lapses', async () => {
    const { svc, emitted, seed } = harness();
    const bond = await seed();
    const expired = await svc.act(bond.id, 'expire');
    expect(expired.status).toBe('expired');
    expect(emitted()).toContain('contracts.bond.expired');
  });

  it('still emits released / called, and refuses a second action on a closed bond', async () => {
    const { svc, emitted, seed } = harness();
    const a = await seed();
    await svc.act(a.id, 'release');
    expect(emitted()).toContain('contracts.bond.released');
    await expect(svc.act(a.id, 'call')).rejects.toThrow(/cannot call a released bond/i);

    const b = await seed();
    await svc.act(b.id, 'call');
    expect(emitted()).toContain('contracts.bond.called');
  });

  it('lists active bonds expiring within the window', async () => {
    const { svc, seed } = harness();
    await seed();
    expect((await svc.expiring('t1', 3650)).map((x) => x.reference)).toEqual(['PB-1']);
  });

  it('sweeps lapsed bonds into expired — idempotently, leaving unexpired ones alone', async () => {
    const { svc, emitted } = harness();
    const lapsed = await svc.create({ tenantId: 't1', contractId: 'c1', kind: 'performance', reference: 'PB-OLD', amount: 100_000, expiryDate: '2020-01-01' });
    const live = await svc.create({ tenantId: 't1', contractId: 'c1', kind: 'warranty', reference: 'WB-NEW', amount: 50_000, expiryDate: '2099-01-01' });
    const openEnded = await svc.create({ tenantId: 't1', contractId: 'c1', kind: 'retention', reference: 'RB-NONE', amount: 10_000 });

    const swept = await svc.expireLapsed('t1');
    expect(swept.map((b) => b.reference)).toEqual(['PB-OLD']);
    expect((await svc.get(lapsed.id))?.status).toBe('expired');
    expect((await svc.get(live.id))?.status).toBe('active');
    expect((await svc.get(openEnded.id))?.status).toBe('active'); // no expiry date = nothing to lapse
    expect(emitted().filter((t) => t === 'contracts.bond.expired')).toHaveLength(1);

    expect(await svc.expireLapsed('t1')).toEqual([]); // second sweep finds nothing
  });
});
